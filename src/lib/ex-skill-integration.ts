import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

/**
 * Ex-Skill 工具集成层
 * 
 * 集成所有ex-skill中的Python工具和Prompt
 */

const TOOLS_DIR = path.join(process.cwd(), 'lib', 'ex-skill', 'tools');
const PROMPTS_DIR = path.join(process.cwd(), 'lib', 'ex-skill', 'prompts');

export interface PythonResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * 运行Python工具
 */
export async function runPythonTool(scriptName: string, args: string[]): Promise<PythonResult> {
  const scriptPath = path.join(TOOLS_DIR, scriptName);
  
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', [scriptPath, ...args]);
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
    
    pythonProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 加载Prompt文件
 */
export async function loadPrompt(promptName: string): Promise<string> {
  const promptPath = path.join(PROMPTS_DIR, promptName);
  return fs.readFile(promptPath, 'utf-8');
}

/**
 * 解析微信聊天记录
 */
export async function parseWeChatChat(
  filePath: string,
  targetName: string,
  outputPath?: string
): Promise<{ success: boolean; messages?: any[]; error?: string }> {
  try {
    const output = outputPath || path.join(process.cwd(), 'uploads', `${targetName}_parsed.txt`);
    
    const result = await runPythonTool('wechat_parser.py', [
      '--file', filePath,
      '--target', targetName,
      '--output', output
    ]);
    
    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }
    
    // 读取解析结果
    const content = await fs.readFile(output, 'utf-8');
    
    return { 
      success: true, 
      messages: [{ type: 'parsed', content, output }]
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 解析iMessage聊天记录
 */
export async function parseIMessageChat(
  filePath: string,
  targetName: string,
  outputPath?: string
): Promise<{ success: boolean; messages?: any[]; error?: string }> {
  try {
    const output = outputPath || path.join(process.cwd(), 'uploads', `${targetName}_imessage.txt`);
    
    const result = await runPythonTool('imessage_parser.py', [
      '--file', filePath,
      '--target', targetName,
      '--output', output
    ]);
    
    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }
    
    const content = await fs.readFile(output, 'utf-8');
    
    return { 
      success: true, 
      messages: [{ type: 'parsed', content, output }]
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 使用skill_writer创建Skill
 */
export async function createSkill(
  slug: string,
  name: string,
  meta: any,
  memoriesContent: string,
  personaContent: string
): Promise<{ success: boolean; skillDir?: string; error?: string }> {
  try {
    // 写入临时文件
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const metaPath = path.join(tempDir, `${slug}_meta.json`);
    const memoriesPath = path.join(tempDir, `${slug}_memories.md`);
    const personaPath = path.join(tempDir, `${slug}_persona.md`);
    
    await Promise.all([
      fs.writeFile(metaPath, JSON.stringify(meta, null, 2)),
      fs.writeFile(memoriesPath, memoriesContent),
      fs.writeFile(personaPath, personaContent)
    ]);
    
    const result = await runPythonTool('skill_writer.py', [
      '--action', 'create',
      '--slug', slug,
      '--name', name,
      '--meta', metaPath,
      '--memories', memoriesPath,
      '--persona', personaPath,
      '--base-dir', path.join(process.cwd(), 'exes')
    ]);
    
    // 清理临时文件
    await Promise.all([
      fs.unlink(metaPath).catch(() => {}),
      fs.unlink(memoriesPath).catch(() => {}),
      fs.unlink(personaPath).catch(() => {})
    ]);
    
    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }
    
    return { 
      success: true, 
      skillDir: path.join(process.cwd(), 'exes', slug)
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 使用skill_writer更新Skill
 */
export async function updateSkill(
  slug: string,
  memoriesPatch?: string,
  personaPatch?: string
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const args = ['--action', 'update', '--slug', slug, '--base-dir', path.join(process.cwd(), 'exes')];
    
    if (memoriesPatch) {
      const memoriesPatchPath = path.join(tempDir, `${slug}_memories_patch.md`);
      await fs.writeFile(memoriesPatchPath, memoriesPatch);
      args.push('--memories-patch', memoriesPatchPath);
    }
    
    if (personaPatch) {
      const personaPatchPath = path.join(tempDir, `${slug}_persona_patch.md`);
      await fs.writeFile(personaPatchPath, personaPatch);
      args.push('--persona-patch', personaPatchPath);
    }
    
    const result = await runPythonTool('skill_writer.py', args);
    
    // 清理临时文件
    const files = await fs.readdir(tempDir).catch(() => []);
    for (const file of files) {
      if (file.startsWith(slug)) {
        await fs.unlink(path.join(tempDir, file)).catch(() => {});
      }
    }
    
    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }
    
    // 从输出中提取版本号
    const versionMatch = result.stdout.match(/v\d+/);
    const version = versionMatch ? versionMatch[0] : 'v1';
    
    return { success: true, version };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 列出所有已创建的Skill
 */
export async function listSkills(): Promise<{ success: boolean; skills?: any[]; error?: string }> {
  try {
    const result = await runPythonTool('skill_writer.py', [
      '--action', 'list',
      '--base-dir', path.join(process.cwd(), 'exes')
    ]);
    
    if (result.code !== 0) {
      return { success: false, error: result.stderr };
    }
    
    // 解析输出
    const lines = result.stdout.split('\n');
    const skills: any[] = [];
    let currentSkill: any = null;
    
    for (const line of lines) {
      if (line.startsWith('  [')) {
        if (currentSkill) {
          skills.push(currentSkill);
        }
        const match = line.match(/\[(.+?)\]\s+(.+?)\s+—\s+(.+)/);
        if (match) {
          currentSkill = {
            slug: match[1],
            name: match[2],
            identity: match[3],
            version: '',
            corrections_count: 0
          };
        }
      } else if (currentSkill && line.includes('版本:')) {
        const versionMatch = line.match(/版本:\s+(v\d+)/);
        if (versionMatch) {
          currentSkill.version = versionMatch[1];
        }
        const correctionsMatch = line.match(/纠正次数:\s+(\d+)/);
        if (correctionsMatch) {
          currentSkill.corrections_count = parseInt(correctionsMatch[1]);
        }
      }
    }
    
    if (currentSkill) {
      skills.push(currentSkill);
    }
    
    return { success: true, skills };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 加载所有需要的Prompt
 */
export async function loadAllPrompts(): Promise<{
  intake: string;
  personaAnalyzer: string;
  personaBuilder: string;
  memoriesAnalyzer: string;
  memoriesBuilder: string;
  merger: string;
  correctionHandler: string;
}> {
  const [intake, personaAnalyzer, personaBuilder, memoriesAnalyzer, memoriesBuilder, merger, correctionHandler] = 
    await Promise.all([
      loadPrompt('intake.md'),
      loadPrompt('persona_analyzer.md'),
      loadPrompt('persona_builder.md'),
      loadPrompt('memories_analyzer.md'),
      loadPrompt('memories_builder.md'),
      loadPrompt('merger.md'),
      loadPrompt('correction_handler.md')
    ]);
  
  return {
    intake,
    personaAnalyzer,
    personaBuilder,
    memoriesAnalyzer,
    memoriesBuilder,
    merger,
    correctionHandler
  };
}
