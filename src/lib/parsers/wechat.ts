import { ChatParser, ParsedMessage, ParseResult } from './types';

export class WeChatParser implements ChatParser {
  type = 'wechat';

  parse(content: string, targetName: string): ParseResult {
    const lines = content.split('\n').filter(line => line.trim());
    const messages: ParsedMessage[] = [];
    const participants = new Set<string>();

    // 匹配微信导出格式
    const pattern = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)(?:[:：])\s*(.+)$/;

    let currentMessage: Partial<ParsedMessage> | null = null;

    for (const line of lines) {
      const match = line.match(pattern);

      if (match) {
        // 保存上一条消息
        if (currentMessage) {
          messages.push(currentMessage as ParsedMessage);
        }

        const sender = match[2].trim();
        participants.add(sender);

        currentMessage = {
          id: `msg_${messages.length}`,
          sender,
          content: match[3].trim(),
          timestamp: new Date(match[1].replace(/\//g, '-')),
          type: this.detectMessageType(match[3]),
          isFromTarget: sender === targetName
        };
      } else if (currentMessage) {
        // 多行消息
        currentMessage.content += '\n' + line.trim();
      }
    }

    // 保存最后一条消息
    if (currentMessage) {
      messages.push(currentMessage as ParsedMessage);
    }

    // 过滤目标人物的消息
    const targetMessages = messages.filter(m => m.isFromTarget);

    // 计算统计信息
    const textMessages = messages.filter(m => m.type === 'text');
    const totalLength = textMessages.reduce((sum, m) => sum + m.content.length, 0);

    return {
      messages,
      metadata: {
        totalCount: messages.length,
        targetCount: targetMessages.length,
        dateRange: {
          start: messages[0]?.timestamp || new Date(),
          end: messages[messages.length - 1]?.timestamp || new Date()
        },
        participants: Array.from(participants)
      },
      statistics: {
        textCount: textMessages.length,
        imageCount: messages.filter(m => m.type === 'image').length,
        voiceCount: messages.filter(m => m.type === 'voice').length,
        averageLength: textMessages.length > 0 ? totalLength / textMessages.length : 0
      }
    };
  }

  validate(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!content || content.trim().length === 0) {
      errors.push('内容为空');
    }

    const pattern = /\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/;
    if (!pattern.test(content)) {
      errors.push('未找到有效的日期时间格式');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private detectMessageType(content: string): ParsedMessage['type'] {
    if (content.includes('[图片]') || content.includes('<image')) return 'image';
    if (content.includes('[语音]') || content.includes('<voice')) return 'voice';
    if (content.includes('[视频]') || content.includes('<video')) return 'video';
    if (content.includes('[文件]') || content.includes('<file')) return 'file';
    if (content.includes('[位置]') || content.includes('<location')) return 'location';
    if (content.includes('[表情]') || content.includes('<sticker')) return 'sticker';
    return 'text';
  }
}