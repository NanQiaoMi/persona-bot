export interface ParsedMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'voice' | 'video' | 'file' | 'location' | 'sticker';
  isFromTarget: boolean;
  metadata?: Record<string, unknown>;
}

export interface ParseResult {
  messages: ParsedMessage[];
  metadata: {
    totalCount: number;
    targetCount: number;
    dateRange: {
      start: Date;
      end: Date;
    };
    participants: string[];
  };
  statistics: {
    textCount: number;
    imageCount: number;
    voiceCount: number;
    averageLength: number;
  };
}

export interface ChatParser {
  type: string;
  parse(content: string, targetName: string): ParseResult;
  validate(content: string): { valid: boolean; errors: string[] };
}

export interface ParseOptions {
  type: 'wechat' | 'imessage' | 'sms' | 'telegram' | 'whatsapp';
  targetName: string;
  startDate?: Date;
  endDate?: Date;
  includeMedia?: boolean;
}