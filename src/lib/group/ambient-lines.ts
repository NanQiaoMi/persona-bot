/**
 * 群聊「自发开聊」的离线兜底话术（没有可用 LLM 时使用）。
 *
 * 占位符只允许：
 * - {activity} 我现在在做什么（如 在工位改方案）
 * - {moment}   我最近朋友圈的一条内容
 * - {topic}    当前群话题
 * - {name}     其他群成员的简称
 * - {quote}    群里更早的一句消息摘录
 */

export type AmbientMode = 'authentic' | 'fun' | 'companion' | 'analytical';

export type AmbientSeedKind =
  | 'activity'
  | 'moment'
  | 'topic'
  | 'tease'
  | 'callback'
  | 'daily'
  | 'ping_owner';

/** Lines a persona uses to START a topic in a quiet group. Placeholders: {activity} (what I'm doing now, e.g. '在工位改方案'), {moment} (my recent moments post text), {topic} (group topic), {name} (another member's short name), {quote} (an earlier group message snippet). */
export const AMBIENT_STARTER_LINES: Record<AmbientMode, Record<AmbientSeedKind, string[]>> = {
  authentic: {
    activity: [
      '我在{activity}呢 手都敲酸了',
      '{activity}到一半 懒得动了',
      '刚忙完{activity} 脑子已经空了',
      '现在还在{activity} 你们先聊',
      '{activity}这破活 真没劲',
      '谁懂啊 我还在{activity}',
    ],
    moment: [
      '刚在朋友圈发了{moment} 你们看到没',
      '{moment}那条是我发的 别笑',
      '我那条{moment}怎么没人点赞啊',
      '翻了下朋友圈 还是{moment}最离谱',
      '说真的 {moment}我自己看了都想笑',
      '朋友圈刷到自己的{moment} 尴尬到脚趾抠地',
    ],
    topic: [
      '群里聊{topic}我还是有点懵',
      '{topic}这事我有话说',
      '你们刚说的{topic} 我觉得没那么简单',
      '我对{topic}没啥想法 你们接着',
      '{topic}到底谁说了算啊',
      '说{topic}我就想到一件事',
    ],
    tease: [
      '{name}你上次那个方案是不是抄的',
      '{name}别装了 我看见你在线',
      '{name}又开始摆烂了是吧',
      '我觉得{name}最近有点飘啊',
      '{name}你是不是又迟到了',
      '说实话 {name}的话我只信一半',
    ],
    callback: [
      '你刚说的"{quote}"我还在琢磨',
      '还记得那句{quote}吗 笑死',
      '{quote}这句我到现在都忘不了',
      '群里有人说{quote} 我当场就破防了',
      '重看聊天记录 又翻到{quote}',
      '突然想起你之前那句{quote}',
    ],
    daily: [
      '楼下奶茶店买一送一 我已经排队了',
      '刚拆了个快递 是我自己买的袜子',
      '晚饭吃了碗隔壁的牛肉面 香死了',
      '下雨了 伞又没带 人生如此',
      '今天的太阳出来得比我早',
      '我家猫把我的充电线咬断了 绝望😭',
    ],
    ping_owner: [
      '@群主 下周的排期能不能松一点',
      '@群主 你那边的文件发我一下',
      '@群主 这个群要不要定个规矩',
      '@群主 今晚吃啥你拍板吧',
      '@群主 我的假期申请批了没',
      '@群主 群名能不能改得正经点',
    ],
  },
  fun: {
    activity: [
      '我在{activity}你能不能别烦我',
      '{activity}到现在还没完 我要崩了',
      '你猜我在干嘛 在{activity}呢 惨不惨',
      '{activity}的时候被老板抓包 笑死',
      '刚{activity}完 感觉自己要成精了',
      '又在{activity} 你们别羡慕',
    ],
    moment: [
      '你们快去看我那条{moment} 笑死我了',
      '{moment}那个帖子是我发的 认了',
      '我昨天发的{moment}被你们点赞了没',
      '刷到自己的{moment}差点把手机扔了',
      '{moment}这种东西也好意思发',
      '谁给我{moment}点的赞 出来挨骂',
    ],
    topic: [
      '{topic}这事谁先开的头 我要找他算账',
      '聊{topic}能不能别这么严肃 笑死',
      '我一听{topic}就想吐槽 来吧',
      '{topic}都能聊这么久 你们是闲的吧',
      '这个{topic}我有一万句话要说',
      '群里一提{topic} 就没人正经了哈哈',
    ],
    tease: [
      '{name}你又在偷偷摸鱼吧 我看见了',
      '{name}别装了 你那个表情包我都存了',
      '{name}你这发言水平 我真是服了',
      '我觉得{name}今天的头发有点抽象哈哈',
      '{name}你是不是又被老板骂了',
      '{name}再说一句我就把你黑历史抖出来',
    ],
    callback: [
      '你之前那句{quote}我到现在还笑',
      '{quote}这话谁说的 我记了好久',
      '翻记录翻到{quote} 差点呛到',
      '你还敢提{quote} 你自己忘了吧',
      '{quote}这句我要裱起来挂墙上',
      '群里那句{quote}是谁的锅',
    ],
    daily: [
      '楼下奶茶店又出新品 难喝到离谱',
      '刚被外卖小哥鄙视了 我的错',
      '猫把我的泡面打翻了 我没处说理',
      '下午茶点了三杯 我是废物',
      '今天的地铁挤得像沙丁鱼 救命',
      '体检报告出来 我的肝在哭😭',
    ],
    ping_owner: [
      '@群主 你能不能管管这群里的废话',
      '@群主 周末团建定了没 催一下',
      '@群主 我的年假能不能早点批',
      '@群主 群公告写得太敷衍了吧',
      '@群主 你是不是又偷偷改群名了',
      '@群主 奶茶钱你是不是该还了',
    ],
  },
  companion: {
    activity: [
      '{activity}辛苦啦 记得喝口水',
      '你在{activity}吗 别太累了哦',
      '看你在{activity} 慢慢来 不着急',
      '{activity}的时候也要照顾好自己呀',
      '忙完{activity}早点休息好不好',
      '今天的{activity}辛苦你了 抱抱',
    ],
    moment: [
      '刚看到你发的{moment} 好温柔呀',
      '{moment}那条我看了好几遍 很喜欢',
      '你那条{moment}真的很有感觉',
      '看到你的{moment} 心里暖暖的',
      '{moment}记得好好记录下来哦',
      '你发的{moment}我都替你开心',
    ],
    topic: [
      '{topic}这个话题我挺想听你们聊的',
      '聊{topic}的时候大家都好认真呀',
      '关于{topic} 你们有什么想法吗',
      '{topic}我不太懂 但我愿意听',
      '慢慢说{topic}吧 不着急的',
      '{topic}的事情别憋着 说出来会好点',
    ],
    tease: [
      '{name}今天也很可爱呀 别不好意思',
      '{name}你又熬夜了吧 我猜的哈哈',
      '{name}是不是偷偷笑了 我看到啦',
      '{name}你这小脑瓜又在想什么呢',
      '哎呀{name}别害羞 大家都喜欢你',
      '{name}你总是这样 让人又气又心疼',
    ],
    callback: [
      '还记得你说过{quote}吗 我一直记着',
      '{quote}这句话我很喜欢呢',
      '想起你之前说的{quote} 好暖心',
      '你那句{quote}我想了好久',
      '{quote}这句 我现在看还是很感动',
      '翻到你的{quote} 忍不住笑了',
    ],
    daily: [
      '今天的晚霞特别好看 分享给你们',
      '煮了一锅小米粥 暖胃又暖心',
      '楼下的桂花开了 香得不得了',
      '下雨天别忘了带伞哦',
      '刚泡了杯热茶 慢慢喝很舒服',
      '今晚月亮好圆 你们抬头看了吗🌙',
    ],
    ping_owner: [
      '@群主 辛苦你啦 要不要歇会儿',
      '@群主 周末大家想不想一起吃个饭',
      '@群主 群里有点吵 你要不要说说',
      '@群主 谢谢你一直带着我们呀',
      '@群主 天冷了 注意身体哦',
      '@群主 有空的话要不要聚一聚',
    ],
  },
  analytical: {
    activity: [
      '在{activity} 暂时不方便细聊',
      '{activity}中 预计半小时后回',
      '目前{activity} 进度大概六成',
      '{activity}结束后同步结论',
      '正在{activity} 有事群里说',
      '{activity}这项还没收尾 先别催',
    ],
    moment: [
      '你们看了{moment}吗 数据还挺有意思',
      '{moment}那条内容 我觉得逻辑有漏洞',
      '关于{moment} 我的看法比较保守',
      '{moment}这条复盘得还行 可以参考',
      '看了一遍{moment} 结论是可以更简洁',
      '{moment}的效果比预期好 记一笔',
    ],
    topic: [
      '先对齐一下{topic}的范围 再讨论',
      '{topic}这个方向 我有两点意见',
      '讨论{topic}前 先定个标准',
      '{topic}的风险点主要在时间上',
      '就{topic}而言 目前没有更优解',
      '{topic}这件事 先别急着下结论',
    ],
    tease: [
      '{name}这个方案的假设 你确定成立吗',
      '{name}的数据我没看懂 能解释一下吗',
      '{name}又改需求了 这次准备几版',
      '我觉得{name}的判断偏乐观 就这一点',
      '{name}你上次说的时间 现在过了吧',
      '{name}的结论很快 论据呢',
    ],
    callback: [
      '回看{quote} 这个判断当时就有问题',
      '{quote}这句话 我记下来了',
      '按{quote}的说法 结果已经出来了',
      '翻到{quote} 我们当时漏掉了一个变量',
      '{quote}这条 现在看依然成立',
      '之前那句{quote} 值得再核实一下',
    ],
    daily: [
      '楼下新开的咖啡店 性价比尚可',
      '今天的通勤时间比预期多了十分钟',
      '刚查了一下 下周可能会降温',
      '午饭吃了一碗面 热量估计偏高',
      '家里的路由器又断线了 很烦',
      '顺路买了两本书 进度大概一半',
    ],
    ping_owner: [
      '@群主 下周的排期需要你确认一下',
      '@群主 本周的任务进度能同步下吗',
      '@群主 这个需求的优先级要定一下',
      '@群主 会议纪要是谁负责整理的',
      '@群主 预算表的口径是不是改了',
      '@群主 请给个明确的截止时间',
    ],
  },
};

/** Lines OTHER members use to reply to a starter. Placeholder {name} = the starter's short name (optional). */
export const AMBIENT_FOLLOW_LINES: Record<AmbientMode, string[]> = {
  authentic: [
    '哈哈 确实是这样',
    '我也觉得 说不上来就是烦',
    '你这话有点道理 但我不认',
    '{name}说得对吧 我觉得差不多',
    '真的假的 我怎么不知道',
    '嗯 我也这么想的',
    '别问我 我也刚醒',
    '{name}你先别急 等会儿再说',
    '行吧 随你们怎么聊',
    '我嘴硬 不承认 但你说得对',
    '哦 这个我倒是有经验',
    '{name}你又把话题拐跑了',
  ],
  fun: [
    '哈哈哈哈我服了 你们别拦我😂',
    '{name}你这话说得太损了 我喜欢',
    '笑死 谁给你的勇气说这个',
    '+1 我已经在笑了 别管我',
    '这波我站{name}这边 你们自己看着办',
    '不是吧 你也这么想啊',
    '嘴上说不要 身体很诚实哈哈',
    '{name}别急 等我找到证据再来',
    '我先截图留证 回头再算账',
    '好家伙 这话题又歪到姥姥家了',
    '你们一个个的 就没一个正经的',
    '{name}你给我闭嘴 哈哈哈',
  ],
  companion: [
    '嗯嗯 我也是这么想的',
    '{name}说得好温柔啊 我喜欢',
    '是呀 慢慢聊就很好',
    '抱抱你 别太往心里去哦🤍',
    '我同意 你们觉得呢',
    '{name}别担心 我们都在呢',
    '好呀 那我们就这么定啦',
    '辛苦啦 大家都很棒',
    '这个我懂 慢慢来就好',
    '{name}你也要照顾好自己呀',
    '听你们这么说 心里暖暖的',
    '{name}今天也辛苦啦 抱一下',
  ],
  analytical: [
    '同意 数据支持这个结论',
    '{name}说的有道理 我补充一点',
    '这个假设需要验证一下',
    '从目前的信息看 方向没问题',
    '{name}的意见我记下了',
    '也可以 但成本要算清楚',
    '收到 我这边晚点给结果',
    '{name}这个点我没考虑到 受教了',
    '结论成立的前提是什么',
    '简单说 先做再优化',
    '这个口径我认可 没意见',
    '{name}你的逻辑链有个断点',
  ],
};

/** Very short reactions anyone can drop without context: '+1', '哈哈哈哈', '确实', '笑死', '真的假的', '6', '？', '懂了', '我也是', '[捂脸]' style. */
export const QUICK_REACTIONS: string[] = [
  '+1',
  '哈哈哈哈',
  '确实',
  '笑死',
  '真的假的',
  '6',
  '？',
  '懂了',
  '我也是',
  '[捂脸]',
  '真的啊',
  '牛啊',
  '好耶',
  '离谱',
  '同意',
  '我猜到了',
  '这也行',
];

/** WeChat 拍一拍 suffixes appended after "A 拍了拍 B" e.g. '的小脑袋', '并说：醒醒', '的肩膀', '' (empty allowed). */
export const PAT_SUFFIXES: string[] = [
  '的小脑袋',
  '并说：醒醒',
  '的肩膀',
  '',
  '的后背',
  '一下',
  '的呆毛',
  '让他快点回',
  '并说：在吗',
  '的脸',
];
