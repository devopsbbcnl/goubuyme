export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var m=localStorage.getItem('gbm_theme');if(m==='dark'){document.documentElement.setAttribute('data-mode','dark');}}catch(e){}})();`,
      }}
    />
  );
}
