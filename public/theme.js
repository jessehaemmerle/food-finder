try {
  const saved = localStorage.getItem('food-finder:theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
} catch { /* storage blocked: follow the system setting */ }
