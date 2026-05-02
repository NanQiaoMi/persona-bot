"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

interface User {
  username: string;
  role: string;
}

export default function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setUser(data.data.user);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/';
  };

  const navLinks = [
    { href: '/', label: '微信' },
    { href: '/create', label: '通讯录' },
    { href: '/gallery', label: '发现' },
    { href: '/models', label: '模型' },
  ];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled 
        ? 'bg-white/80 backdrop-blur-xl border-b border-white/50 shadow-sm' 
        : 'bg-white/60 backdrop-blur-lg border-b border-white/30'
    }`}>
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#07C160] to-[#06AD56] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <span className="text-white text-sm">💬</span>
            </div>
            <h1 className="text-base font-semibold text-[#353535] tracking-tight">PersonaBot</h1>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 text-sm font-medium transition-all duration-200 rounded-lg ${
                    isActive
                      ? 'text-[#07C160] bg-[#07C160]/8'
                      : 'text-[#999999] hover:text-[#353535] hover:bg-black/[0.03]'
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-[#07C160] rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                <Link
                  href="/settings"
                  className="p-2 rounded-lg text-[#999999] hover:text-[#353535] hover:bg-black/[0.03] transition-all"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="p-2 rounded-lg text-[#999999] hover:text-[#353535] hover:bg-black/[0.03] transition-all"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </Link>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-1.5 text-sm text-[#666666] hover:text-[#353535] transition-colors"
                >
                  登录
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-1.5 text-sm bg-[#07C160] hover:bg-[#06AD56] text-white rounded-lg transition-all shadow-sm hover:shadow-md"
                >
                  注册
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 rounded-lg text-[#999999] hover:text-[#353535] hover:bg-black/[0.03] transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-2 pb-4 animate-fade-in">
            <div className="glass-card rounded-xl p-2 mt-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={`block px-4 py-2.5 rounded-lg text-sm transition-all ${
                      isActive
                        ? 'text-[#07C160] bg-[#07C160]/8 font-medium'
                        : 'text-[#999999] hover:text-[#353535] hover:bg-black/[0.03]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              
              <div className="border-t border-[#E5E5E5]/50 my-2 mx-3" />
              
              {user ? (
                <>
                  <Link
                    href="/settings"
                    onClick={() => setIsMenuOpen(false)}
                    className="block px-4 py-2.5 rounded-lg text-sm text-[#999999] hover:text-[#353535] hover:bg-black/[0.03]"
                  >
                    设置
                  </Link>
                  <button
                    onClick={() => { handleLogout(); setIsMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 rounded-lg text-sm text-[#FA5151] hover:bg-[#FA5151]/5"
                  >
                    退出登录
                  </button>
                </>
              ) : (
                <div className="p-3 space-y-2">
                  <Link
                    href="/login"
                    onClick={() => setIsMenuOpen(false)}
                    className="block text-center py-2.5 text-sm text-[#666666] hover:text-[#353535]"
                  >
                    登录
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsMenuOpen(false)}
                    className="block text-center py-2.5 text-sm bg-[#07C160] hover:bg-[#06AD56] text-white rounded-lg transition-all"
                  >
                    注册
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
