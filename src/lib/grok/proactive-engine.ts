import { PersonaEmotionSnapshot, PersonaRecord } from '@/lib/storage/types';

export interface ProactiveGreetingResult {
  thought: string;
  content: string;
  bursts: string[];
  moodLabel: string;
  emotionState: PersonaEmotionSnapshot;
  intimacyChange: number;
  timeContextLabel: string;
}

export function getTimePeriodInfo(hour: number): {
  period: 'late_night' | 'morning' | 'afternoon' | 'evening';
  label: string;
} {
  if (hour >= 0 && hour < 6) {
    return { period: 'late_night', label: '凌晨夜猫子时段 🌙' };
  }
  if (hour >= 6 && hour < 12) {
    return { period: 'morning', label: '清晨破冰时段 ☀️' };
  }
  if (hour >= 12 && hour < 18) {
    return { period: 'afternoon', label: '午后摸鱼时段 ☕' };
  }
  return { period: 'evening', label: '夜晚放松时段 🌆' };
}

/**
 * 基于当前时段、距上次聊天时长与角色性格，生成主动破冰消息与情绪变化
 */
export function generateProactiveGreeting(
  persona: PersonaRecord,
  hoursSinceLastChat = 0,
  currentHour = new Date().getHours()
): ProactiveGreetingResult {
  const { period, label } = getTimePeriodInfo(currentHour);
  const isLongIdle = hoursSinceLastChat >= 6;
  const mode = persona.defaultMode;

  let thought = '';
  let bursts: string[] = [];
  let moodLabel = persona.emotionState.moodLabel || '在线中';
  let pleasureDelta = 0.05;
  let intimacyChange = 1;

  if (isLongIdle) {
    if (mode === 'fun' || persona.slug === 'grok-ella') {
      thought = `这家伙失联了 ${Math.round(hoursSinceLastChat)} 个小时，我得先损他两句，再把刚刷到的热搜甩过去。`;
      bursts = [
        `哟，失踪人口回归了？我都快以为你被外星人抓去写代码了`,
        `刚刷到好几个离谱热搜，本来想忍住不跟你说，算了还是赏你听听吧 ⚡`,
      ];
      moodLabel = '抱臂挑眉中 ⚡';
      pleasureDelta = 0.08;
    } else if (persona.slug === 'lin-wan' || mode === 'authentic') {
      thought = `居然隔了 ${Math.round(hoursSinceLastChat)} 小时没理我……绝不能直接说想他，随便找个借口敲他一下。`;
      bursts = [
        `刚才年糕踩到我手机屏幕，不小心点开你头像了而已`,
        `……你今天到底在忙什么呀，半天没动静`,
      ];
      moodLabel = '嘴硬小赌气 🌙';
      pleasureDelta = -0.05;
    } else if (mode === 'companion' || persona.slug === 'su-nian') {
      thought = `好几个小时没收到消息了，不知道是不是今天太累了，主动发句关心让他安心。`;
      bursts = [
        `今天是不是忙坏啦？好几个小时没见你冒泡泡`,
        `忙完记得喝口水告诉我一声，我一直在呢 🌸`,
      ];
      moodLabel = '温柔挂念中 🌸';
      pleasureDelta = 0.1;
      intimacyChange = 2;
    } else {
      thought = `间隔 ${Math.round(hoursSinceLastChat)} 小时未同步上下文，主动发起低熵破冰。`;
      bursts = [
        `好几个小时没动静，看来你今天遇到硬骨头了。`,
        `卡在哪个问题上了？发出来我帮你拆一下。`,
      ];
      moodLabel = '冷静候命中 🛸';
    }
  } else if (period === 'late_night') {
    thought = `都凌晨 ${currentHour} 点多了还没睡，这家伙肯定又在熬夜冲浪或者想心事。`;
    if (mode === 'fun') {
      bursts = [
        `抓获一只凌晨 ${currentHour} 点还没睡的赛博夜猫子！`,
        `怎么说，是在冲浪吃瓜还是睡不着？我刚好精神着呢 ⚡`,
      ];
      moodLabel = '深夜冲浪嗨皮中 ⚡';
    } else if (mode === 'companion') {
      bursts = [
        `都这么晚啦，怎么还没睡呀？`,
        `要是心里有事睡不着，我陪你聊会儿天好不好 🌸`,
      ];
      moodLabel = '深夜温柔陪伴 🌸';
    } else {
      bursts = [
        `……这么晚还没睡？`,
        `别熬太狠了，有什么事跟我说说呗。`,
      ];
      moodLabel = '深夜微醺感 🌙';
    }
  } else if (period === 'morning') {
    thought = `早上刚醒，顺手跟对方打个招呼开启今天的话题。`;
    bursts = [
      `早呀，今天醒得居然比闹钟还早一点`,
      `你今天忙不忙？等会儿路上陪我聊两句呗`,
    ];
    moodLabel = '元气早安 ☀️';
  } else {
    thought = `趁着现在有空，主动戳一下对方看看在干嘛。`;
    if (mode === 'fun') {
      bursts = [
        `呼叫呼叫，现在是合法摸鱼时间！`,
        `快跟我讲讲你那边有啥好玩的事，或者考考我今天的热搜 ⚡`,
      ];
      moodLabel = '摸鱼找乐子 ⚡';
    } else {
      bursts = [
        `突然想到你这会儿应该不忙了吧？`,
        `快出来陪我聊五块钱的～`,
      ];
      moodLabel = '主动营业中 ✨';
    }
  }

  const updatedEmotion: PersonaEmotionSnapshot = {
    ...persona.emotionState,
    pleasure: Math.max(-1, Math.min(1, Number((persona.emotionState.pleasure + pleasureDelta).toFixed(2)))),
    moodLabel,
    lastUpdated: new Date().toISOString(),
  };

  return {
    thought,
    content: bursts.join('\n'),
    bursts,
    moodLabel,
    emotionState: updatedEmotion,
    intimacyChange,
    timeContextLabel: label,
  };
}
