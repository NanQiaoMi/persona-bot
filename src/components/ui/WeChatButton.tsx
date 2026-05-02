import React from 'react';

interface WeChatButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
}

export const WeChatButton: React.FC<WeChatButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  className = '',
}) => {
  const baseStyles = 'rounded-lg font-medium transition-all duration-200 active:scale-95';

  const variantStyles = {
    primary: 'bg-[#07C160] hover:bg-[#06AD56] text-white',
    secondary: 'bg-[#EDEDED] hover:bg-[#D9D9D9] text-[#353535]',
    danger: 'bg-[#FA5151] hover:bg-[#E04B4B] text-white',
  };

  const sizeStyles = {
    small: 'px-3 py-1.5 text-sm',
    medium: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg',
  };

  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`}
    >
      {children}
    </button>
  );
};

export default WeChatButton;
