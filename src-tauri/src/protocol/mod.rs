//! Esquema personalizado `opendoc://` (T8, SPEC §4.3).
//!
//! Formas aceptadas (todas llevan a lo mismo):
//! `opendoc://<id>/<ruta>`, `opendoc://localhost/<id>/<ruta>` (macOS/Linux)
//! y `http://opendoc.localhost/<id>/<ruta>` (Windows/Android).
//! El contenido se muestra en un `<iframe>` aislado de la UI.
//!
//! Handler asíncrono: cada fichero se lee en un hilo bloqueante para no
//! frenar el hilo de UI ni servir en serie los recursos de una página.

// La resolución segura de rutas vive en el núcleo compartido
// (`opendoc_core::resolve`) para que el CLI use exactamente las mismas
// reglas.
pub use opendoc_core::resolve::{content_type_for, resolve_request, ResolveError, ResolvedFile};

use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::commands::AppState;
use crate::docset::Docset;

/// Error al servir. Se traduce a estado HTTP, no a `ApiError`.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ServeError {
    /// Ningún docset cargado tiene ese id.
    UnknownDocset,
    /// El docset no tiene `Documents/` (p. ej. tarix).
    NoDocuments,
    /// Sin página de inicio conocida.
    NoHomePage,
    /// La ruta no se pudo resolver o leer.
    Resolve(ResolveError),
}

/// `(id, resto)` de cualquier forma de URI aceptada, o `None` sin id.
pub fn parse_opendoc_uri(uri: &tauri::http::Uri) -> Option<(String, String)> {
    let host = uri.host().unwrap_or("");
    let mut segs: Vec<&str> = uri.path().split('/').filter(|s| !s.is_empty()).collect();
    if !host.is_empty() && host != "localhost" && host != "opendoc.localhost" {
        Some((host.to_string(), segs.join("/")))
    } else if segs.is_empty() {
        None
    } else {
        Some((segs.remove(0).to_string(), segs.join("/")))
    }
}

/// Sirve un fichero de docset como respuesta HTTP (puro, testeable).
pub fn serve_file(docsets: &[Docset], id: &str, raw_path: &str) -> tauri::http::Response<Vec<u8>> {
    match serve_inner(docsets, id, raw_path) {
        Ok((bytes, mime)) => response(
            200,
            mime,
            if mime == "text/html" {
                inject_theme_support(&bytes)
            } else {
                bytes
            },
        ),
        Err(ServeError::UnknownDocset) => {
            response(404, "text/plain", b"docset desconocido".to_vec())
        }
        Err(ServeError::NoDocuments) => {
            response(404, "text/plain", b"docset sin documentos".to_vec())
        }
        Err(ServeError::NoHomePage) => {
            response(404, "text/plain", b"sin pagina de inicio".to_vec())
        }
        Err(ServeError::Resolve(ResolveError::NotFound(_))) => {
            response(404, "text/plain", b"no encontrado".to_vec())
        }
        Err(ServeError::Resolve(_)) => response(403, "text/plain", b"prohibido".to_vec()),
    }
}

/// Lógica de servicio: docset → `Documents/` → fichero.
fn serve_inner(
    docsets: &[Docset],
    id: &str,
    raw_path: &str,
) -> Result<(Vec<u8>, &'static str), ServeError> {
    let docset = docsets
        .iter()
        .find(|d| d.id == id)
        .ok_or(ServeError::UnknownDocset)?;
    let documents = docset.contents_path.join("Resources/Documents");
    if !documents.is_dir() {
        return Err(ServeError::NoDocuments);
    }
    // Sin ruta (`opendoc://<id>`) → página de inicio del docset.
    let path = if raw_path.is_empty() {
        docset.home_path.as_deref().ok_or(ServeError::NoHomePage)?
    } else {
        raw_path
    };
    let resolved = resolve_request(&documents, path).map_err(ServeError::Resolve)?;
    let bytes = std::fs::read(&resolved.path)
        .map_err(|_| ServeError::Resolve(ResolveError::NotFound(raw_path.to_string())))?;
    Ok((bytes, resolved.mime))
}

/// Soporte de tema por parte de la aplicación. Los docsets conservan sus
/// colores claros originales. Inyecta SIEMPRE en `text/html` un bloque
/// constante: estilo para controles claros y un `<script>` mínimo con
/// cuatro tareas: aplicar
/// el tema que mande `window.parent`, reportar navegaciones al padre en
/// `load` y `hashchange` (caza anclas `#...` sin petición nueva), reportar
/// scroll throttled con su URL (más volcado final en `pagehide`) y
/// restaurarlo a petición, saltar a un ancla sin recargar
/// (`opendoc-hash`, con `location.replace`: sin entrada de historial nativa),
/// y reenviar solo los atajos
/// Ctrl/Cmd+K/W/T, Ctrl/Cmd+Tab, Ctrl/Cmd+1..9 y Alt+←/→.
/// Además captura auxclick (botón central y botones laterales Atrás/Adelante) y Ctrl/Cmd+clic sobre enlaces
/// `<a>` internos y pide `{type:"opendoc-open-tab", url}` al padre, SOLO
/// con `event.isTrusted`; los externos (otro origen) se dejan pasar para
/// que `on_navigation` los mande al navegador del sistema.
/// El contenido del iframe NO es de fiar: el padre valida todo (origen =
/// el iframe montado, forma exacta, URLs opendoc de docsets cargados,
/// título ≤200 sin controles, scrollY finito en rango, teclas a ≤10/s).
/// Punto de inserción: antes de `</head>` (insensible a caso) o, si no hay,
/// tras el BOM / al inicio. Solo ASCII: no re-codifica el documento.
/// `overscroll-behavior:contain`: al llegar al final del documento el gesto
/// no se encadena al documento de la app (que en macOS rebotaba entero).
pub const THEME_STYLE: &str =
    "<style>html{color-scheme:light!important;overscroll-behavior:contain;}</style>";
pub const THEME_SCRIPT: &str = r#"<script>(function(){function rep(t,x){x=x||{};x.type=t;window.parent.postMessage(x,"*");}function here(){return {url:String(location.href),title:String(document.title)};}function ownDark(){try{var m=document.querySelector('meta[name="color-scheme"]');if(m&&/dark/.test(m.content)&&!/light/.test(m.content))return true;var els=[document.body,document.documentElement];for(var i=0;i<els.length;i++){if(!els[i])continue;var p=getComputedStyle(els[i]).backgroundColor.match(/[\d.]+/g);if(p&&p.length>=3&&(p.length<4||Number(p[3])>0.5)){return (0.299*p[0]+0.587*p[1]+0.114*p[2])/255<0.4;}}}catch(_){}return false;}window.addEventListener("message",function(e){if(e.source!==window.parent)return;var d=e.data;if(!d)return;if(d.type==="opendoc-theme"){var root=document.documentElement;if(d.value==="dark"&&!ownDark()){root.setAttribute("data-opendoc-theme","dark");}else{root.removeAttribute("data-opendoc-theme");}}else if(d.type==="opendoc-scroll-to"){var y=Number(d.y);if(isFinite(y)&&y>=0){window.scrollTo(0,y);}}else if(d.type==="opendoc-hash"&&typeof d.hash==="string"&&d.hash.length<=4096){if(d.hash){if(location.hash!=='#'+d.hash){location.replace('#'+d.hash);}}else{window.scrollTo(0,0);}}});window.addEventListener("DOMContentLoaded",function(){rep("opendoc-ready",here());},{once:true});window.addEventListener("load",function(){rep("opendoc-nav",here());});window.addEventListener("hashchange",function(){rep("opendoc-nav",here());});var lastY=-1,lastT=0;function sendScroll(force){var y=window.scrollY||window.pageYOffset||0;var t=Date.now();if(y!==lastY&&(force||t-lastT>250)){lastT=t;lastY=y;rep("opendoc-scroll",{y:y,url:String(location.href)});}}window.addEventListener("scroll",function(){sendScroll(false);},true);window.addEventListener("pagehide",function(){sendScroll(true);});document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")sendScroll(true);});window.addEventListener("keydown",function(e){if(e.isComposing||e.key==="Process")return;var c=e.code||"",k=c==="KeyW"?"w":c==="KeyT"?"t":c==="KeyK"?"k":c==="Tab"?"tab":/^Digit([1-9])$/.test(c)?c.charAt(5):/^Numpad([1-9])$/.test(c)?c.charAt(6):null;if((e.ctrlKey||e.metaKey)&&!e.altKey&&k!==null){e.preventDefault();if(e.stopPropagation)e.stopPropagation();rep("opendoc-key",{key:k,shift:!!e.shiftKey});}else if(e.altKey&&!e.ctrlKey&&!e.metaKey&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){e.preventDefault();if(e.stopPropagation)e.stopPropagation();rep("opendoc-key",{key:e.key==="ArrowLeft"?"alt-left":"alt-right",shift:!!e.shiftKey});}},true);function linkUrl(e){try{var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return null;var u=new URL(a.getAttribute("href"),document.baseURI);if(u.origin!==location.origin)return null;return u.toString();}catch(_){return null;}}var hoverTimer=null,hoverAnchor=null;window.addEventListener("pointerover",function(e){if(!e.isTrusted)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;var u=linkUrl(e);if(!a||!u)return;try{var target=new URL(u),current=new URL(location.href);if(target.pathname===current.pathname&&target.search===current.search)return;}catch(_){return;}if(hoverTimer)clearTimeout(hoverTimer);hoverAnchor=a;hoverTimer=setTimeout(function(){if(hoverAnchor===a&&a.matches(":hover"))rep("opendoc-prefetch",{url:u});},60);},true);function openTab(e){if(!e.isTrusted)return;var u=linkUrl(e);if(!u)return;e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();else if(e.stopPropagation)e.stopPropagation();rep("opendoc-open-tab",{url:u});}window.addEventListener("mousedown",function(e){if(e.button===1&&linkUrl(e)){e.preventDefault();}},true);window.addEventListener("auxclick",function(e){if(e.button===1){openTab(e);}else if(e.button===3||e.button===4){e.preventDefault();e.stopPropagation();rep("opendoc-key",{key:e.button===3?"mouse-back":"mouse-forward",shift:false});}},true);window.addEventListener("click",function(e){if(e.button!==0||e.altKey||e.shiftKey)return;if(e.ctrlKey||e.metaKey){openTab(e);return;}if(!e.isTrusted)return;var u=linkUrl(e);if(!u)return;var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;try{var target=new URL(u),current=new URL(location.href);if(target.pathname===current.pathname&&target.search===current.search)return;}catch(_){return;}e.preventDefault();if(e.stopPropagation)e.stopPropagation();rep("opendoc-navigate",{url:u,title:a&&a.textContent?a.textContent.trim():document.title});},true);})();</script>"#;

/// Scroll de rueda/trackpad dentro del docset. Lo que llega nativo al iframe
/// se deja al scroll nativo del navegador (fluido, con inercia, sin JS en
/// cada evento). Safari puede entregar el `wheel` al documento padre cuando
/// el contenido vive en un iframe; el visor lo reenvía por postMessage y este
/// script desplaza el scroller interno a mano.
/// Sin doble aplicación: si el gesto también llegó nativo al iframe (caso
/// normal), el reenviado se ignora durante 50 ms; si solo llegó al padre
/// (rareza de WebKit), el reenviado sí se aplica. El pellizco (ctrlKey)
/// nunca se reenvía como scroll.
/// Desplazamiento suave: con `opendoc-smooth-scroll {enabled:true}` del
/// padre, los saltos de rueda de ratón (por línea/página o ≥50 px) se animan
/// ~180 ms con easing (solo esos eventos se cancelan); los deltas pequeños
/// del trackpad siguen siendo nativos. Si algo externo
/// mueve el scroller (barra, teclado, ancla), la animación se cancela.
pub const THEME_WHEEL_SCRIPT: &str = r#"<script>(function(){
function pixels(value,mode,viewport){return mode===1?value*16:mode===2?value*viewport:value;}
function canMove(el,axis,delta){var size=axis==="y"?el.scrollHeight-el.clientHeight:el.scrollWidth-el.clientWidth;if(size<1)return false;var pos=axis==="y"?el.scrollTop:el.scrollLeft;return delta>0?pos<size-1:delta<0?pos>1:false;}
var smooth=false,DUR=180,anim=typeof WeakMap==="function"?new WeakMap():null;
function now(){return window.performance&&performance.now?performance.now():Date.now();}
function pos(n,a){return a==="y"?n.scrollTop:n.scrollLeft;}
function setPos(n,a,v){if(a==="y")n.scrollTop=v;else n.scrollLeft=v;}
function ease(t){return 1-Math.pow(1-t,3);}
function step(n,a,s){if(!s.run)return;if(Math.abs(pos(n,a)-s.last)>2){s.run=false;return;}var t=Math.min(1,(now()-s.t0)/DUR);setPos(n,a,s.from+(s.to-s.from)*ease(t));s.last=pos(n,a);if(t>=1){s.run=false;return;}requestAnimationFrame(function(){step(n,a,s);});}
function go(n,a,delta,soft){var st=anim?anim.get(n):null,s=st?st[a]:null,running=!!(s&&s.run);if(!smooth||!anim||(!soft&&!running)){if(running)s.run=false;setPos(n,a,pos(n,a)+delta);return;}if(!st){st={};anim.set(n,st);}if(!s){s={run:false};st[a]=s;}var size=a==="y"?n.scrollHeight-n.clientHeight:n.scrollWidth-n.clientWidth,base=running?s.to:pos(n,a);s.from=pos(n,a);s.last=s.from;s.to=Math.max(0,Math.min(size,base+delta));s.t0=now();if(!running){s.run=true;requestAnimationFrame(function(){step(n,a,s);});}}
function moveAxis(target,axis,delta,soft){if(!delta)return;var root=document.scrollingElement;for(var el=target;el&&el!==document;el=el.parentElement){var node=el===document.body||el===document.documentElement?root:el;if(!node)continue;var style=getComputedStyle(node),overflow=axis==="y"?style.overflowY:style.overflowX;if(node===root||/^(auto|scroll|overlay|hidden)$/.test(overflow)){if(canMove(node,axis,delta)){go(node,axis,delta,soft);return;}}}if(root&&canMove(root,axis,delta)){go(root,axis,delta,soft);}}
function apply(x,y,dx,dy,mode){var sx=pixels(dx,mode,window.innerWidth),sy=pixels(dy,mode,window.innerHeight),target=document.elementFromPoint(x,y)||document.documentElement;moveAxis(target,"x",sx,mode!==0||Math.abs(sx)>=50);moveAxis(target,"y",sy,mode!==0||Math.abs(sy)>=50);}
var lastSelf=0;
window.addEventListener("wheel",function(e){if(e.ctrlKey){e.preventDefault();return;}lastSelf=Date.now();if(!smooth||!anim||!(e.deltaMode!==0||Math.abs(e.deltaY)>=50||Math.abs(e.deltaX)>=50))return;e.preventDefault();apply(e.clientX,e.clientY,e.deltaX,e.deltaY,e.deltaMode);},{capture:true,passive:false});
window.addEventListener("message",function(e){if(e.source!==window.parent||!e.data)return;var d=e.data;if(d.type==="opendoc-smooth-scroll"){smooth=d.enabled===true;return;}if(d.type!=="opendoc-wheel")return;if(typeof d.deltaX!=="number"||typeof d.deltaY!=="number"||!isFinite(d.deltaX)||!isFinite(d.deltaY)||d.ctrlKey)return;if(Date.now()-lastSelf<50)return;apply(Number(d.x)||0,Number(d.y)||0,d.deltaX,d.deltaY,Number(d.deltaMode)||0);});
})();</script>"#;

/// Modo oscuro de los docsets (beta). Mismo enfoque que el modo "filtro" de
/// Dark Reader, y equivalente portable al `ForceDarkMode` de Chromium que
/// usa Zeal (WKWebView/WebKitGTK no tienen nada parecido):
/// - el documento se invierte y se rota el tono 180° (los enlaces siguen
///   siendo azules; `.9` evita el negro puro);
/// - imágenes, vídeo, lienzos, objetos incrustados y elementos con `url(` en
///   su estilo en línea (`background`/`background-image`, no `none`) se
///   vuelven a invertir para conservar sus colores reales. Solo el más
///   externo: lo que va dentro de `<picture>` o de un fondo con imagen ya
///   queda re-invertido con su contenedor (si no, se invertiría dos veces);
/// - `contrast(1.25)` en la re-inversión compensa el `.9` de la raíz: sin él
///   las imágenes salían lavadas (rango 10–90 %);
/// - las `<img>` llevan una placa clara detrás: los dibujos de líneas
///   oscuras sobre fondo transparente (diagramas, fórmulas) serían
///   invisibles sobre el fondo oscuro. En imágenes opacas no se ve;
/// - la barra de desplazamiento no hereda el filtro: se oscurece aparte con
///   `scrollbar-color`;
/// - solo actúa con `data-opendoc-theme="dark"` en `<html>`, que el script
///   pone al recibir `opendoc-theme {value:"dark"}` del visor y nunca en
///   páginas que ya son oscuras por sí mismas (`ownDark`).
///
/// `filter` en el elemento raíz no rompe `position: fixed` (la especificación
/// lo exime de crear bloque contenedor).
pub const DARK_STYLE: &str = r#"<style>html[data-opendoc-theme=dark]{filter:invert(.9) hue-rotate(180deg);background-color:#fff;min-height:100%;scrollbar-color:#5c5c5c #1a1a1a;}html[data-opendoc-theme=dark] :is(img,picture,video,canvas,iframe,embed,object,svg image,[style*="url(" i]):not(:is(picture,[style*="url(" i]) *){filter:invert(1) contrast(1.25) hue-rotate(180deg);}html[data-opendoc-theme=dark] img{background-color:#fff;}</style>"#;

/// Resaltado de la búsqueda en página (CSS Custom Highlight API). Donde no
/// existe `::highlight`, la regla es inválida y se ignora (el script cae a
/// seleccionar la coincidencia actual).
pub const ACTIONS_STYLE: &str = "<style>::highlight(opendoc-find){background-color:rgba(250,204,21,.45);color:inherit;}::highlight(opendoc-find-current){background-color:#f97316;color:#fff;}</style>";

/// Acciones propias de OpenDoc dentro del docset:
/// - Menú contextual: anula el nativo y, SOLO con `event.isTrusted`, pide
///   `{type:"opendoc-context", x, y, selection, link}` al padre (enlace solo
///   si es del mismo origen; el padre lo valida igualmente).
/// - Búsqueda en página: obedece `opendoc-find` / `opendoc-find-clear` de
///   `window.parent` (consulta ≤200, como máximo 2000 coincidencias visibles)
///   y responde `opendoc-find-result` con el total y la posición actual.
/// - Zoom: aplica `opendoc-zoom` (0.25..5) como `zoom` del documento y
///   reenvía Ctrl/Cmd+rueda, Ctrl/Cmd +/-/0 y Ctrl/Cmd+F como `opendoc-key`.
/// - `opendoc-select-all`: selecciona el contenido del documento.
/// - `opendoc-activated`: avisa una vez por documento de la primera
///   interacción real (pointerdown/keydown con `isTrusted`). El visor la usa
///   para tratar como redirección (sustituir, no apilar) las navegaciones
///   que una página hace sola (meta refresh, redirecciones por JS).
///
/// Igual que el resto del canal: no lleva datos de usuario y todo lo que
/// manda al padre se valida allí (ver `src/lib/iframeMessages.ts`).
pub const ACTIONS_SCRIPT: &str = r#"<script>(function(){
function rep(t,x){x=x||{};x.type=t;window.parent.postMessage(x,"*");}
var SKIP={SCRIPT:1,STYLE:1,NOSCRIPT:1,TEMPLATE:1,TEXTAREA:1,SELECT:1,OPTION:1};
var HL=!!(window.CSS&&CSS.highlights&&window.Highlight);
var ranges=[],cur=-1,lastQ="",lastCase=false,MAX=2000;
function clearHl(){if(HL){CSS.highlights.delete("opendoc-find");CSS.highlights.delete("opendoc-find-current");}}
function collect(q,cs){ranges=[];cur=-1;if(!q||!document.body)return;var nq=cs?q:q.toLowerCase();var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;return !p||SKIP[p.tagName]?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});var n;while((n=w.nextNode())&&ranges.length<MAX){var s=cs?n.data:n.data.toLowerCase();if(s.length!==n.data.length)continue;var i=s.indexOf(nq);while(i!==-1&&ranges.length<MAX){var r=document.createRange();r.setStart(n,i);r.setEnd(n,i+nq.length);if(r.getClientRects().length>0)ranges.push(r);i=s.indexOf(nq,i+nq.length);}}}
function paint(){if(HL){clearHl();if(ranges.length){var h=new Highlight();for(var i=0;i<ranges.length;i++)h.add(ranges[i]);CSS.highlights.set("opendoc-find",h);}if(cur>=0)CSS.highlights.set("opendoc-find-current",new Highlight(ranges[cur]));}else if(cur>=0){var sel=window.getSelection();if(sel){sel.removeAllRanges();sel.addRange(ranges[cur]);}}}
function reveal(r){var vh=window.innerHeight,rect=r.getBoundingClientRect();if(rect.top>=0&&rect.bottom<=vh)return;var el=r.startContainer.parentElement;if(el&&el.scrollIntoView)el.scrollIntoView({block:"center",inline:"nearest"});rect=r.getBoundingClientRect();if(rect.top<0||rect.bottom>vh)window.scrollBy(0,rect.top-vh/2);}
function clr(){ranges=[];cur=-1;lastQ="";clearHl();}
function find(q,dir,cs){if(q!==lastQ||cs!==lastCase||!ranges.length){lastQ=q;lastCase=cs;collect(q,cs);if(ranges.length){cur=0;for(var i=0;i<ranges.length;i++){if(ranges[i].getBoundingClientRect().bottom>=0){cur=i;break;}}}}else{cur=(cur+dir+ranges.length)%ranges.length;}paint();if(cur>=0)reveal(ranges[cur]);rep("opendoc-find-result",{total:ranges.length,current:cur+1});}
window.addEventListener("message",function(e){if(e.source!==window.parent)return;var d=e.data;if(!d||typeof d!=="object")return;
if(d.type==="opendoc-find"){var q=typeof d.query==="string"?d.query.slice(0,200):"";if(!q){clr();rep("opendoc-find-result",{total:0,current:0});return;}find(q,d.dir===-1?-1:d.dir===1?1:0,d.caseSensitive===true);}
else if(d.type==="opendoc-find-clear"){clr();}
else if(d.type==="opendoc-zoom"){var z=Number(d.level);if(isFinite(z)&&z>=0.25&&z<=5)document.documentElement.style.zoom=z===1?"":String(z);}
else if(d.type==="opendoc-select-all"){var s=window.getSelection();if(s&&document.body){s.removeAllRanges();var r=document.createRange();r.selectNodeContents(document.body);s.addRange(r);}}});
window.addEventListener("keydown",function(e){if(e.isComposing||e.key==="Process")return;if(e.key==="Escape"&&lastQ&&!e.ctrlKey&&!e.metaKey&&!e.altKey){rep("opendoc-key",{key:"find-close",shift:false});return;}if(!(e.ctrlKey||e.metaKey)||e.altKey)return;var c=e.code||"",k=c==="KeyF"?"f":(c==="Equal"||c==="NumpadAdd"||e.key==="+"||e.key==="=")?"zoom-in":(c==="Minus"||c==="NumpadSubtract"||e.key==="-")?"zoom-out":(c==="Digit0"||c==="Numpad0")?"zoom-reset":null;if(k===null)return;e.preventDefault();if(e.stopPropagation)e.stopPropagation();rep("opendoc-key",{key:k,shift:!!e.shiftKey});},true);
var acc=0,lastZ=0;
window.addEventListener("wheel",function(e){if(!e.ctrlKey||!e.isTrusted)return;e.preventDefault();acc+=e.deltaMode===1?e.deltaY*33:e.deltaY;var now=Date.now();if(Math.abs(acc)<50||now-lastZ<80)return;lastZ=now;rep("opendoc-key",{key:acc<0?"zoom-in":"zoom-out",shift:false});acc=0;},{capture:true,passive:false});
window.addEventListener("pointerdown",function(e){if(e.isTrusted&&e.button!==2)rep("opendoc-pointerdown");},true);
var act=false;function activate(e){if(act||!e.isTrusted)return;act=true;rep("opendoc-activated");}window.addEventListener("pointerdown",activate,true);window.addEventListener("keydown",activate,true);
window.addEventListener("contextmenu",function(e){e.preventDefault();if(!e.isTrusted)return;var s="";try{s=String(window.getSelection()||"");}catch(_){}var a=e.target&&e.target.closest?e.target.closest("a[href]"):null,u=null;if(a){try{var x=new URL(a.getAttribute("href"),location.href);if(x.origin===location.origin)u=x.toString();}catch(_){}}rep("opendoc-context",{x:e.clientX,y:e.clientY,selection:s.slice(0,10000),link:u});},true);
})();</script>"#;

/// Índice de la página: recopila los encabezados visibles (h1–h4, fuera de
/// `nav`/`header`/`footer`) al cargar y los envía como
/// `{type:"opendoc-toc", items:[{text, level}]}` (máx. 200, texto ≤160).
/// Con el scroll avisa del encabezado en curso (`opendoc-toc-active`,
/// `{index}`) y obedece `opendoc-toc-go {index}` del padre (desplaza con
/// suavidad hasta él). El padre valida todo (contenido no fiable).
pub const TOC_SCRIPT: &str = r#"<script>(function(){
function rep(t,x){x=x||{};x.type=t;window.parent.postMessage(x,"*");}
var hs=[],act=-1,raf=0;
function collect(){var list=document.querySelectorAll("h1,h2,h3,h4");hs=[];var items=[];for(var i=0;i<list.length&&items.length<200;i++){var h=list[i];if(h.closest("nav,header,footer,[role=navigation]"))continue;var r=h.getBoundingClientRect();if(!r.width&&!r.height)continue;var tx=(h.textContent||"").replace(/\s+/g," ").replace(/[¶#]\s*$/,"").trim();if(!tx)continue;hs.push(h);items.push({text:tx.slice(0,160),level:Number(h.tagName.charAt(1))});}act=-1;rep("opendoc-toc",{items:items});spy();}
function spy(){raf=0;if(!hs.length)return;var cur=0;for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top<=96)cur=i;else break;}var el=document.documentElement;if(window.innerHeight+(window.scrollY||0)>=el.scrollHeight-2)cur=hs.length-1;if(cur!==act){act=cur;rep("opendoc-toc-active",{index:cur});}}
window.addEventListener("scroll",function(){if(!raf)raf=requestAnimationFrame(spy);},true);
window.addEventListener("load",collect);
window.addEventListener("message",function(e){if(e.source!==window.parent||!e.data)return;var d=e.data;if(d.type==="opendoc-toc-go"){var i=Number(d.index);if(Number.isInteger(i)&&i>=0&&i<hs.length)hs[i].scrollIntoView({behavior:"smooth",block:"start"});}else if(d.type==="opendoc-toc-request"){collect();}});
})();</script>"#;

/// BOM UTF-8 (se respeta al insertar al inicio).
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Inserta `THEME_STYLE + THEME_SCRIPT` en un HTML.
pub fn inject_theme_support(html: &[u8]) -> Vec<u8> {
    let block =
        format!(
            "{THEME_STYLE}{DARK_STYLE}{ACTIONS_STYLE}{THEME_SCRIPT}{THEME_WHEEL_SCRIPT}{ACTIONS_SCRIPT}{TOC_SCRIPT}"
        );
    let bytes = block.as_bytes();
    if let Some(pos) = find_head_close(html) {
        let mut out = Vec::with_capacity(html.len() + bytes.len());
        out.extend_from_slice(&html[..pos]);
        out.extend_from_slice(bytes);
        out.extend_from_slice(&html[pos..]);
        out
    } else {
        let start = if html.starts_with(&UTF8_BOM) {
            UTF8_BOM.len()
        } else {
            0
        };
        let mut out = Vec::with_capacity(html.len() + bytes.len());
        out.extend_from_slice(&html[..start]);
        out.extend_from_slice(bytes);
        out.extend_from_slice(&html[start..]);
        out
    }
}

/// Posición de `</head>` insensible a mayúsculas (`None` si no hay).
fn find_head_close(html: &[u8]) -> Option<usize> {
    const NEEDLE: &[u8] = b"</head>";
    html.windows(NEEDLE.len()).position(|w| {
        w.iter()
            .zip(NEEDLE.iter())
            .all(|(a, b)| a.to_ascii_lowercase() == *b)
    })
}
/// constantes inválidas, que no usamos).
/// `Access-Control-Allow-Origin: *`: el iframe tiene origen opaco
/// (sandbox sin same-origin) y las fuentes (@font-face) y fetch() exigen
/// CORS incluso en mismo host; `*` es seguro aquí (sin credenciales ni
/// cookies; este host solo existe dentro del webview).
fn response(status: u16, mime: &'static str, body: Vec<u8>) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

/// Handler asíncrono registrado en `lib.rs`. La lectura de disco va en un
/// hilo bloqueante: el hilo de UI (donde WebKit/WebView2 llaman al
/// handler) no se queda esperando por cada CSS/JS/imagen, y las
/// peticiones de una página se sirven en paralelo. Nunca pánico.
pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    req: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    let uri = req.uri().clone();
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(serve_uri(&app, &uri));
    });
}

/// Resuelve una URI: el candado de estado solo se toma para copiar el
/// docset pedido; la lectura del fichero se hace sin él.
fn serve_uri<R: Runtime>(
    app: &tauri::AppHandle<R>,
    uri: &tauri::http::Uri,
) -> tauri::http::Response<Vec<u8>> {
    let (id, rest) = match parse_opendoc_uri(uri) {
        Some(parts) => parts,
        None => return response(400, "text/plain", b"invalid url".to_vec()),
    };
    let Some(state) = app.try_state::<AppState>() else {
        return response(500, "text/plain", b"no state".to_vec());
    };
    let docset = match state.loaded.lock() {
        Ok(loaded) => loaded.docsets.iter().find(|d| d.id == id).cloned(),
        Err(_) => return response(500, "text/plain", b"state locked".to_vec()),
    };
    serve_file(docset.as_slice(), &id, &rest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    fn uri(s: &str) -> tauri::http::Uri {
        s.parse().expect("uri válida")
    }

    #[test]
    fn parses_all_uri_shapes() {
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://localhost/css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("http://opendoc.localhost/css/a/b.html")),
            Some(("css".to_string(), "a/b.html".to_string()))
        );
        assert_eq!(
            parse_opendoc_uri(&uri("opendoc://css")),
            Some(("css".to_string(), "".to_string()))
        );
        assert_eq!(parse_opendoc_uri(&uri("opendoc://localhost/")), None);
    }

    /// Docset sintético con `Documents/sub/index.html` en Temp.
    fn sample_docset(dir: &Path) -> Docset {
        let contents = dir.join("Contents");
        let docs = contents.join("Resources/Documents");
        std::fs::create_dir_all(docs.join("sub")).expect("mkdirs");
        std::fs::write(docs.join("a.html"), "<html>a</html>").expect("write");
        std::fs::write(docs.join("sub/index.html"), "<html>sub</html>").expect("write");
        Docset {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: Some("a.html".to_string()),
            icon: None,
            root_path: dir.to_path_buf(),
            contents_path: contents,
        }
    }

    #[test]
    fn serves_files_dirs_and_home() {
        let dir = tempfile::tempdir().expect("tempdir");
        let docsets = vec![sample_docset(dir.path())];
        let ok = serve_file(&docsets, "demo", "a.html");
        assert_eq!(ok.status(), 200);
        assert_eq!(ok.headers().get("Content-Type").expect("mime"), "text/html");
        // CORS para el iframe de origen opaco (fuentes web y fetch).
        assert_eq!(
            ok.headers()
                .get("Access-Control-Allow-Origin")
                .expect("cors"),
            "*"
        );
        assert_eq!(serve_file(&docsets, "demo", "sub").status(), 200);
        assert_eq!(serve_file(&docsets, "demo", "").status(), 200);
        assert_eq!(serve_file(&docsets, "demo", "nope.html").status(), 404);
        assert_eq!(serve_file(&docsets, "demo", "../x").status(), 403);
        assert_eq!(serve_file(&docsets, "otro", "a.html").status(), 404);
    }

    #[test]
    fn theme_injection_points() {
        // Antes de </head> (cualquier caso).
        for html in [
            "<html><head><title>x</title></head><body></body></html>",
            "<HTML><HEAD></HEAD><BODY></BODY></HTML>",
        ] {
            let out = inject_theme_support(html.as_bytes());
            let s = String::from_utf8(out).expect("utf8");
            assert!(s.contains(THEME_STYLE), "{html}");
            assert!(s.contains(THEME_SCRIPT), "{html}");
            assert!(s.contains(THEME_WHEEL_SCRIPT), "{html}");
            let style_pos = s.find(THEME_STYLE).expect("style");
            let head_pos = s.to_lowercase().find("</head>").expect("head");
            assert!(style_pos < head_pos, "{html}");
        }
        // Sin head: al inicio (tras BOM si lo hay).
        let no_head = "<html><body>hola</body></html>";
        let out = inject_theme_support(no_head.as_bytes());
        let no_head_out = String::from_utf8(out).expect("utf8");
        assert!(no_head_out.starts_with(THEME_STYLE));
        assert!(no_head_out.contains(THEME_WHEEL_SCRIPT));
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(no_head.as_bytes());
        let out = inject_theme_support(&bom);
        assert_eq!(&out[..3], &[0xEF, 0xBB, 0xBF]);
        assert!(String::from_utf8(out[3..].to_vec())
            .expect("utf8")
            .starts_with(THEME_STYLE));
        // El bloque es constante: mismo input, mismo output.
        assert_eq!(
            inject_theme_support(no_head.as_bytes()),
            inject_theme_support(no_head.as_bytes())
        );
    }

    #[test]
    fn non_html_untouched_and_script_shape() {
        // El script solo acepta forma exacta desde window.parent.
        assert!(TOC_SCRIPT.contains("e.source!==window.parent"));
        assert!(TOC_SCRIPT.contains("\"opendoc-toc\""));
        assert!(TOC_SCRIPT.contains("\"opendoc-toc-active\""));
        assert!(TOC_SCRIPT.contains("\"opendoc-toc-go\""));
        assert!(TOC_SCRIPT.starts_with("<script>(function(){"));
        assert!(TOC_SCRIPT.ends_with("})();</script>"));
        assert!(THEME_SCRIPT.contains("e.source!==window.parent"));
        assert!(THEME_SCRIPT.contains("\"opendoc-theme\""));
        assert!(THEME_SCRIPT.contains("data-opendoc-theme"));
        assert!(THEME_STYLE.contains("color-scheme:light!important"));
        assert!(!THEME_STYLE.contains("invert("));
        // Modo oscuro (beta): solo con el atributo que pone el script, y
        // re-invierte el contenido multimedia.
        assert!(DARK_STYLE.is_ascii());
        assert!(DARK_STYLE.contains("html[data-opendoc-theme=dark]{filter:invert("));
        for token in [
            ":is(img,picture,video,canvas,",
            "[style*=\"url(\" i]",
            // Sin doble inversión dentro de <picture> o de un fondo con imagen.
            ":not(:is(picture,[style*=\"url(\" i]) *)",
            "contrast(1.25)",
            "img{background-color:#fff;}",
            "scrollbar-color:",
        ] {
            assert!(DARK_STYLE.contains(token), "falta {token}");
        }
        assert!(THEME_SCRIPT.contains("ownDark"));
        assert!(THEME_SCRIPT.contains("d.value===\"dark\""));
        // Canal de navegación: reportes + restauración de scroll + teclas.
        // Sigue siendo una constante sin datos de usuario.
        assert!(THEME_SCRIPT.starts_with("<script>(function(){"));
        assert!(THEME_SCRIPT.ends_with("})();</script>"));
        for token in [
            "\"opendoc-nav\"",
            "hashchange",
            "\"opendoc-scroll\"",
            "\"opendoc-scroll-to\"",
            "pagehide",
            "\"opendoc-key\"",
            "\"opendoc-open-tab\"",
            "\"opendoc-prefetch\"",
            "\"opendoc-ready\"",
            "\"opendoc-hash\"",
            "location.replace",
            "document.baseURI",
            "e.ctrlKey||e.metaKey",
            "stopImmediatePropagation",
            "pointerover",
            "auxclick",
            "isTrusted",
            "closest",
            "alt-left",
            "alt-right",
            "KeyW",
            "Numpad",
            "isComposing",
            "mouse-back",
            "mouse-forward",
        ] {
            assert!(THEME_SCRIPT.contains(token), "falta {token}");
        }
        for token in [
            "opendoc-wheel",
            "passive:false",
            "scrollTop",
            "scrollLeft",
            "\"opendoc-smooth-scroll\"",
            "requestAnimationFrame",
        ] {
            assert!(THEME_WHEEL_SCRIPT.contains(token), "falta {token}");
        }
        // Acciones propias: menú contextual, búsqueda y zoom.
        assert!(ACTIONS_SCRIPT.starts_with("<script>(function(){"));
        assert!(ACTIONS_SCRIPT.ends_with("})();</script>"));
        assert!(ACTIONS_SCRIPT.is_ascii());
        assert!(ACTIONS_STYLE.is_ascii());
        for token in [
            "e.source!==window.parent",
            "\"contextmenu\"",
            "\"opendoc-context\"",
            "isTrusted",
            "\"opendoc-find\"",
            "\"opendoc-find-clear\"",
            "\"opendoc-find-result\"",
            "\"opendoc-zoom\"",
            "\"opendoc-select-all\"",
            "KeyF",
            "zoom-in",
            "zoom-out",
            "zoom-reset",
            "find-close",
            "CSS.highlights",
            "\"opendoc-pointerdown\"",
            "\"opendoc-activated\"",
        ] {
            assert!(ACTIONS_SCRIPT.contains(token), "falta {token}");
        }
        assert!(ACTIONS_STYLE.contains("::highlight(opendoc-find)"));
    }

    #[test]
    fn injection_only_in_html() {
        let dir = tempfile::tempdir().expect("tempdir");
        // PNG mínimo: firma + IHDR(1x1) + IEND.
        let mut png = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0, 0, 0, 13]);
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&[0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
        png.extend_from_slice(&[0, 0, 0, 0]);
        png.extend_from_slice(b"IEND");
        let contents = dir.path().join("Contents");
        let docs = contents.join("Resources/Documents");
        std::fs::create_dir_all(&docs).expect("mkdirs");
        std::fs::write(docs.join("i.png"), &png).expect("write");
        std::fs::write(docs.join("a.html"), "<html><body>x</body></html>").expect("write");
        let docsets = vec![Docset {
            id: "demo".to_string(),
            name: "Demo".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: Some("a.html".to_string()),
            icon: None,
            root_path: dir.path().to_path_buf(),
            contents_path: contents,
        }];
        // El binario sale intacto (sin style/script inyectados).
        let res = serve_file(&docsets, "demo", "i.png");
        assert_eq!(res.status(), 200);
        assert_eq!(
            res.headers().get("Content-Type").expect("mime"),
            "image/png"
        );
        assert_eq!(res.body(), &png);
        // El HTML sí lleva el bloque.
        let res = serve_file(&docsets, "demo", "a.html");
        let body = String::from_utf8(res.body().clone()).expect("utf8");
        assert!(body.contains(THEME_STYLE));
        assert!(body.contains("opendoc-nav"));
    }

    #[test]
    fn real_css_home_serves_with_html_mime() {
        let Some(dsidx_dir) = crate::docset::fixture_or_skip("CSS.docset/Contents/Resources")
        else {
            return;
        };
        let contents = dsidx_dir.parent().expect("Contents").to_path_buf();
        let home = "developer.mozilla.org/en-US/docs/Web/CSS/Reference.html";
        let docsets = vec![Docset {
            id: "css".to_string(),
            name: "CSS".to_string(),
            platform: Some("css".to_string()),
            version: None,
            bundle_id: Some("css".to_string()),
            home_path: Some(home.to_string()),
            icon: None,
            root_path: contents.parent().expect("docset").to_path_buf(),
            contents_path: contents,
        }];
        let res = serve_file(&docsets, "css", home);
        assert_eq!(res.status(), 200);
        assert_eq!(
            res.headers().get("Content-Type").expect("mime"),
            "text/html"
        );
        assert!(!res.body().is_empty());
    }

    #[test]
    fn tarix_without_documents_is_404() {
        if crate::docset::fixture_or_skip("C++.docset").is_none() {
            return;
        }
        let contents = PathBuf::from("tests/fixtures/C++.docset/Contents");
        let docsets = vec![Docset {
            id: "c++".to_string(),
            name: "C++".to_string(),
            platform: None,
            version: None,
            bundle_id: None,
            home_path: None,
            icon: None,
            root_path: PathBuf::from("tests/fixtures/C++.docset"),
            contents_path: contents,
        }];
        assert_eq!(serve_file(&docsets, "c++", "x.html").status(), 404);
    }
}
