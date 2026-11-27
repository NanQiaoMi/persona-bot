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
  const baseStyles = 'rounded-lg font-medium transition-interactive focus-ring active:scale-[0.98]';

  const variantStyles = {
    primary: 'bg-[var(--user-capsule)] hover:opacity-90 text-[var(--user-capsule-text)] shadow-xs',
    secondary: 'bg-[var(--surface-card)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] hairline-border',
    danger: 'bg-[var(--accent-rose)] hover:opacity-90 text-white shadow-xs',
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
