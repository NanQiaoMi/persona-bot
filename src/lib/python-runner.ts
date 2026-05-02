import { spawn } from 'child_process';
import path from 'path';

export interface PythonResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Runs a Python script from the lib/ex-skill/tools directory.
 * @param scriptName The name of the script (e.g., 'wechat_parser.py')
 * @param args Array of arguments to pass to the script
 * @returns Promise with stdout, stderr and exit code
 */
export async function runPythonTool(scriptName: string, args: string[]): Promise<PythonResult> {
  const scriptPath = path.join(process.cwd(), 'lib', 'ex-skill', 'tools', scriptName);
  
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
