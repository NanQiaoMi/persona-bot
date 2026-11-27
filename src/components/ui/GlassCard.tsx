import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className = "" }) => {
  return (
    <div className={`surface-card rounded-2xl p-6 transition-surface ${className}`}>
      {children}
    </div>
  );
};
