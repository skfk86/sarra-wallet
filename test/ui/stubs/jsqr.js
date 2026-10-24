// jsQR وهمي: يعيد عنوان TRON بعد بضعة إطارات من الكاميرا الوهمية
(function(){ var frames=0; window.jsQR=function(data,w,h){ frames++; if (window.__qrData==='none') return null; return (w>0 && h>0 && frames>90) ? {data: window.__qrData || 'tron:TK3aZ4bR8xLkP2vN9cW3jH5sD6fGa12pLw?amount=1'} : null; }; })();
