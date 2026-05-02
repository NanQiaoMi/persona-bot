import Link from 'next/link';
import WeChatAvatar from '../ui/WeChatAvatar';

interface PersonaCardProps {
  name: string;
  slug: string;
  mbti?: string;
  tags?: string[];
  lastActive?: string;
}

export default function PersonaCard({ name, slug, mbti, tags, lastActive }: PersonaCardProps) {
  return (
    <Link
      href={`/chat/${slug}`}
      className="block bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-indigo-500/50 transition-all"
    >
      <div className="flex items-center gap-3 mb-3">
        <WeChatAvatar name={name} size="medium" />
        <div>
          <h3 className="font-medium text-white">{name}</h3>
          {mbti && (
            <span className="text-xs text-indigo-400">{mbti}</span>
          )}
        </div>
      </div>
      
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 3).map((tag, i) => (
            <span
              key={i}
              className="px-2 py-0.5 text-xs rounded-full bg-white/5 text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      
      {lastActive && (
        <p className="text-xs text-zinc-500">
          最近活跃：{lastActive}
        </p>
      )}
    </Link>
  );
}
