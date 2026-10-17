// Runs before the first paint (inline in the website's <head>; a same-origin file in the iOS app because its
// Content-Security-Policy forbids inline scripts). It applies the cached appearance and school palette so the
// page never flashes the wrong theme, and keeps "System" in sync with the operating system.
//
// - Auth pages never show a cached school palette (the next person to sign in may be someone else).
// - window.__campusTheme.forUser(id) drops a cached palette that belongs to a different account; the website's
//   signed-in page calls it before the app renders.
// Mirrors lib/theme/runtime.ts. Plain ES5 on purpose: it runs before any bundle.
export const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,s=null;
try{s=JSON.parse(localStorage.getItem('campusos.theme.v1')||'null')}catch(e){}
var a=s&&(s.appearance==='light'||s.appearance==='dark')?s.appearance:'system';
var m=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function mode(){var p=d.getAttribute('data-appearance')||'system';return p==='system'?(m&&m.matches?'dark':'light'):p}
function clear(){for(var i=d.style.length-1;i>=0;i--){var n=d.style[i];if(n.indexOf('--a')===0)d.style.removeProperty(n)}d.removeAttribute('data-accent-uid')}
d.setAttribute('data-appearance',a);d.setAttribute('data-theme',mode());
if(m){var f=function(){d.setAttribute('data-theme',mode())};if(m.addEventListener)m.addEventListener('change',f);else if(m.addListener)m.addListener(f)}
var auth=/^\\/(login|signup|forgot-password|update-password|auth\\/)/.test(location.pathname);
if(s&&s.accent&&typeof s.accent==='object'&&!auth){for(var p in s.accent){var v=s.accent[p];if(/^--a[ld]-[a-z-]+$/.test(p)&&/^#[0-9a-f]{6}$/i.test(v))d.style.setProperty(p,v)}d.setAttribute('data-accent-uid',typeof s.uid==='string'?s.uid:'')}
window.__campusTheme={forUser:function(u){var o=d.getAttribute('data-accent-uid');if(o!==null&&o!==u)clear()}};
}catch(e){}})();`;
