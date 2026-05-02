import React from 'react';

interface WeChatAvatarProps {
  name: string;
  imageUrl?: string;
  size?: 'small' | 'medium' | 'large';
  online?: boolean;
  className?: string;
}

export const WeChatAvatar: React.FC<WeChatAvatarProps> = ({
  name,
  imageUrl,
  size = 'medium',
  online,
  className = '',
}) => {
  const sizeStyles = {
    small: 'w-8 h-8 text-xs',
    medium: 'w-10 h-10 text-sm',
    large: 'w-12 h-12 text-base',
  };

  const dotSizes = {
    small: 'w-2 h-2',
    medium: 'w-2.5 h-2.5',
    large: 'w-3 h-3',
  };

  const getColorFromName = (name: string) => {
    const colors = [
      'bg-[#07C160]',
      'bg-[#576B95]',
      'bg-[#FA5151]',
      'bg-[#F0A020]',
      'bg-[#10AEFF]',
      'bg-[#6467EF]',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div className={`${sizeStyles[size]} rounded-lg overflow-hidden`}>
        {imageUrl ? (
          <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center text-white font-medium ${getColorFromName(name)}`}
          >
            {name.charAt(0)}
          </div>
        )}
      </div>

      {online !== undefined && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 ${dotSizes[size]} rounded-full border-2 border-white ${
            online ? 'bg-[#07C160]' : 'bg-[#999999]'
          }`}
        />
      )}
    </div>
  );
};

export default WeChatAvatar;
