import React, { createContext, useContext, useEffect } from 'react';

// The Amicus One design is a single light "white canvas" theme; dark mode was retired.
const ThemeContext = createContext({ theme: 'light' });

export function ThemeProvider({ children }) {
  useEffect(() => {
    document.body.setAttribute('data-theme', 'light');
    try { localStorage.removeItem('legalai-theme'); } catch (e) { /* storage unavailable */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'light' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
