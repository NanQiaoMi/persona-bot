import { ChatParser, ParseOptions, ParseResult } from './types';
import { WeChatParser } from './wechat';

export class ParserFactory {
  private parsers: Map<string, ChatParser> = new Map();

  constructor() {
    this.registerParser('wechat', new WeChatParser());
  }

  registerParser(type: string, parser: ChatParser): void {
    this.parsers.set(type, parser);
  }

  getParser(type: string): ChatParser | undefined {
    return this.parsers.get(type);
  }

  parse(options: ParseOptions, content: string): ParseResult {
    const parser = this.getParser(options.type);

    if (!parser) {
      throw new Error(`不支持的解析类型: ${options.type}`);
    }

    // 验证内容
    const validation = parser.validate(content);
    if (!validation.valid) {
      throw new Error(`内容验证失败: ${validation.errors.join(', ')}`);
    }

    // 解析内容
    const result = parser.parse(content, options.targetName);

    // 过滤日期范围
    if (options.startDate || options.endDate) {
      result.messages = result.messages.filter(msg => {
        if (options.startDate && msg.timestamp < options.startDate) return false;
        if (options.endDate && msg.timestamp > options.endDate) return false;
        return true;
      });

      // 更新统计信息
      result.metadata.totalCount = result.messages.length;
      result.metadata.targetCount = result.messages.filter(m => m.isFromTarget).length;
    }

    return result;
  }

  autoDetect(content: string): string | null {
    // 检测微信格式
    const wechatPattern = /\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}.+[:：].+/;
    if (wechatPattern.test(content)) {
      return 'wechat';
    }

    return null;
  }
}

// 全局解析器工厂实例
export const parserFactory = new ParserFactory();