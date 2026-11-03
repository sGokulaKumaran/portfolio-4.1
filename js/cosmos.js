/* ═══════════════════════════════════════════════════════════════
   VOYAGER 6.0 · cosmos.js
   The permanent backdrop: full-screen fragment shader (WebGL1,
   GLSL ES 1.00, single pass, procedural) on <canvas id="cosmos">.

   Upgrades & Fixes in 6.0:
   - Fixed false-positive WebGL kill-switch (`readPixels` pipeline stall
     during boot calibration + `failIfMajorPerformanceCaveat: true`
     rejection) that previously forced many devices onto a static 2D
     fallback instead of the live WebGL cosmos shader.
   - Enhanced shader with spectral star diffraction flares, ionized
     nebula emission ridges, Kerr black hole relativistic polar jets,
     and an orbiting moon around the Trajectory gas giant.
   - Interactive Cosmic Visual Mode (`uMode`: 0 Standard Cosmos,
     1 Nebula Overdrive, 2 Hyper-Singularity) and quality tier cycling.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GK = window.GK;
  if (!GK || !GK.register) return;

  const VERT = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}';

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes,uPtr,uGain,uSun,uShower;
uniform vec3 uColA,uColB,uCap;
uniform vec4 uBH,uPlanet,uRipple;
uniform float uPR,uTime,uTravel,uScroll,uWarp,uWorm,uBass,uDim,uTier,uFlash,uMode;

const float TAU=6.2831853;
const mat2 R2=mat2(.8,.6,-.6,.8);

float ss(float a, float b, float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
float h11(float n){ n=fract(n*.1031); n*=n+33.33; n*=n+n; return fract(n); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2  h22(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+1.),f.x), f.y); }
float fbm(vec2 p, float oct){ float a=.5, s=0.;
  for(int i=0;i<5;i++){ if(float(i)>=oct) break; s+=a*vn(p); p=R2*p*2.03+11.7; a*=.5; }
  return s/(1.-2.*a); }

vec3 stars(vec2 p, vec2 rd, float k){
  vec3 c=vec3(0.);
  for(int i=0;i<3;i++){
    float fi=float(i); if(fi>uTier+1.5) break;
    float sc=52.*exp2(-fi), par=.012*exp2(fi);
    vec2 g=(p+uPtr*par+vec2(fi*7.31, uTime*.0015-uScroll*par*9.))*sc;
    vec2 id=floor(g), f=fract(g)-.5;
    vec2 r=h22(id+fi*31.7); float b=h21(id+fi*31.7+5.3);
    b*=b; b*=b; b*=b*sqrt(b);
    vec2 dv=f-(r-.5)*.56;
    float kk=min(2.5,k*exp2(fi)*.25), al=dot(dv,rd)/(1.+kk), ac=dot(dv,vec2(-rd.y,rd.x))*(1.+.3*kk);
    float si=(.72+1.05*b)*(1.+.22*fi)*uPR, sp=max(si,.75), s=sp*sc/uRes.y;
    float x=(al*al+ac*ac)/(s*s);
    float I=b/((1.+x)*(1.+x))*ss(.22,.06,sqrt(x)*s)*si*si/(sp*sp);
    I*=.86+.14*sin(uTime*(1.2+5.*r.x)+r.y*40.);
    if(b>.55 && fi>1.5 && k<.2){
      float spk=exp(-abs(dv.x)*42.)*exp(-abs(dv.y)*6.)+exp(-abs(dv.y)*42.)*exp(-abs(dv.x)*6.);
      I+=spk*b*.45;
    }
    vec3 tint=mix(vec3(1.,.72,.48),mix(vec3(.96,.98,1.),vec3(.56,.78,1.),ss(.35,.85,r.y)),ss(.1,.7,r.y));
    c+=I*tint*(1.+fi);
  }
  return c;
}

float streaks(vec2 p){
  float a=atan(p.y,p.x)/TAU, r=length(p), s=0.;
  for(int i=0;i<2;i++){
    float n=90.+70.*float(i);
    float id=floor(a*n), fx=abs(fract(a*n)-.5);
    float rn=h11(id+91.7*float(i)+200.);
    float z=fract(rn*13.1+uTravel*(.5+rn));
    float head=z*z*1.15+.03, len=(.02+.5*uWarp*uWarp)*(.3+head);
    float al=ss(head-len,head,r)*ss(head+.012,head,r);
    float hw=1.3*n/(uRes.y*TAU*r);
    s+=al*ss(hw*1.6,hw*.3,fx)*step(.35,rn)*(.4+.6*rn);
  }
  return s*ss(.03,.2,r);
}

vec3 nebula(vec2 p, float oct){
  float boost=1.+.38*ss(.5,1.5,uMode);
  vec2 q=p*1.35+vec2(3.1,-uScroll*.21)+uPtr*.032;
  float t=uTime*.012+uTravel*.05;
  vec2 w=vec2(fbm(q+vec2(t,-.7*t),oct),.5); if(uTier>.5) w.y=fbm(q+vec2(5.2,1.3)-t,oct);
  float n=fbm(q+1.9*w+vec2(-.5*t,.3*t),oct);
  float d=ss(.50,.9,n); d*=d;
  vec3 c=mix(uColA,uColB,ss(.48,.74,w.x+.4*(w.y-.5)));
  float ridge=ss(.68,.88,1.-abs(n-.68)*5.5)*d;
  c=c*d*(.55+1.75*d)*boost+vec3(1.,.93,.86)*d*d*d*.12+mix(uColB,vec3(.3,.9,1.),.4)*ridge*(.18+.15*uBass);
  if(uTier>.5) c*=1.-.68*ss(.4,.7,fbm(q*2.3-w*1.4+9.,3.));
  return c;
}

float ringD(float r){
  return ss(1.3,1.36,r)*ss(2.35,2.28,r)*(.62+.26*sin(r*34.)+.12*sin(r*87.+1.))*(1.-.85*ss(.04,0.,abs(r-1.93)));
}
vec4 planet(vec2 p){
  float R=uPlanet.z;
  vec2 d=(p-uPlanet.xy)/R;
  if(max(abs(d.x),abs(d.y))>2.6) return vec4(0.);
  const vec3 N=vec3(.356,.892,.278);
  const vec3 L=vec3(-.75,.55,.37);
  float r2=dot(d,d), a=0., zs=-1e3; vec3 col=vec3(0.);
  if(r2<1.){
    zs=sqrt(1.-r2); vec3 n=vec3(d,zs);
    float lat=dot(n,N), lon=dot(n,vec3(.929,-.371,0.));
    float bands=.5+.5*sin(lat*16.+2.5*vn(vec2(lat*7.,lon*1.5+uTime*.012)));
    vec3 alb=mix(vec3(.34,.21,.13),vec3(.75,.62,.46),bands);
    float df=ss(-.1,.55,dot(n,L))*(.4+.6*zs);
    float t=-lat/dot(L,N);
    if(t>0.) df*=1.-.75*ringD(length(n+L*t));
    float rim=pow(1.-zs,2.8)*ss(-.35,.45,dot(n,L));
    a=ss(1.,1.-2./(R*uRes.y),sqrt(r2));
    col=(alb*df+vec3(.42,.74,1.)*rim*.38)*a;
  }
  vec3 Q=vec3(d,-(d.x*N.x+d.y*N.y)/N.z);
  float rg=ringD(length(Q))*step(zs,Q.z);
  if(rg>0.){
    float b=dot(Q,L), h=dot(Q,Q)-b*b;
    float sh=b<0.?ss(.9,1.08,sqrt(h)):1.;
    float ra=rg*.76;
    col=vec3(.72,.62,.5)*(.06+.62*sh)*ra+col*(1.-ra); a=ra+a*(1.-ra);
  }
  vec2 mPos=vec2(cos(uTime*.18)*1.85,sin(uTime*.18)*.62);
  float md=length(d-mPos);
  if(md<.14 && (sin(uTime*.18)>0. || r2>1.)){
    float ma=ss(.09,.06,md);
    col=mix(col,vec3(.82,.86,.94)*(.35+.65*ss(-.06,.06,-(d.x-mPos.x))),ma);
    a=max(a,ma);
  }
  return vec4(col,a);
}

vec3 sunrise(vec3 col, vec2 p){
  float top=uSun.y;
  float h=length(p-vec2(0.,top-2.2))-2.2;
  vec2 d=p-vec2(0.,top);
  float side=exp(-abs(d.x)*1.6), up=ss(-.004,.002,h);
  float atm=exp(-max(h,0.)*22.)*side, glow=exp(-max(h,0.)*4.)*side*side*.35;
  col*=mix(1.,up,uSun.x);
  col+=(vec3(1.,.5,.16)*(atm*1.2+glow)+vec3(1.,.86,.66)*.006/(dot(d,d)+.006))*up*uSun.x;
  return col;
}

vec3 blackhole(vec3 col, vec2 d, float r, float R){
  float rr=r/R;
  col*=ss(.96,1.03,rr);
  vec2 dd=mat2(.98,-.199,.199,.98)*d/R;
  vec2 e2=vec2(dd.x,dd.y*4.5); float rho=length(e2), lg=log(max(rho,.3));
  float a1=3.4*lg-uTime*.075, a2=5.6*lg-uTime*.048+1.7;
  vec2 s1=mat2(cos(a1),sin(a1),-sin(a1),cos(a1))*e2, s2=mat2(cos(a2),sin(a2),-sin(a2),cos(a2))*e2;
  float fil=(.3+.7*vn(s1*1.6))*(.68+.32*vn(s2*3.4+7.));
  float prof=ss(1.24,1.5,rho)*pow(1.5/max(rho,1.5),2.4)*ss(4.9,1.9,rho);
  float cphi=e2.x/max(rho,.01), dop=1.-.42*cphi;
  float front=max(step(dd.y,0.),ss(.98,1.05,rr));
  float disk=prof*fil*front;
  float up=dd.y/max(rr,1e-3), side=1.-.4*dd.x/max(rr,1e-3);
  float x=(rr-1.045)/.025;
  float ring=exp(-x*x)*1.65*side;
  float x2=(rr-1.015)/.012;
  ring+=exp(-x2*x2)*.85;
  float arc=exp(-max(rr-1.05,0.)*6.5)*ss(1.,1.08,rr)*(.22+.78*ss(-.8,.75,up))*(.7+.3*vn(dd/max(rr,1e-3)*3.+vec2(-uTime*.06,2.)))*side;
  float bloom=exp(-abs(dd.y)*3.4-abs(dd.x)*.62)*ss(.9,1.5,rr)*(1.-.3*dd.x/max(rr,1.));
  float jet=exp(-abs(dd.x)*5.5)*exp(-abs(dd.y)*.65)*ss(1.0,1.6,abs(dd.y))*(.22+.35*uBass+.35*ss(1.5,2.,uMode));
  float tK=pow(1.5/max(rho,1.5),1.25);
  vec3 heat=mix(vec3(.95,.17,.03),mix(vec3(1.,.44,.12),vec3(1.,.78,.46),ss(.5,1.,tK)),ss(.08,.55,tK+.2*(dop-1.)));
  vec3 em=heat*disk*3.5*dop*dop*dop+vec3(1.,.5,.17)*arc*1.25+vec3(1.,.86,.66)*ring+vec3(1.,.36,.09)*bloom*.18+vec3(.48,.76,1.)*jet*.35;
  return col*(1.-min(1.,disk*1.8))+em*uBH.w*(1.+.1*uBass);
}

float meteor(vec2 p, float asp, float T, float seed, float gate){
  float id=floor(T), k=fract(T);
  vec2 r=h22(vec2(id,seed)); if(r.x<gate) return 0.;
  vec2 dir=normalize(vec2(-.85,-.4-.3*r.y));
  vec2 q=p-(vec2((r.y-.2)*asp,.15+.3*r.x)+dir*k*.6);
  float L=.2*sin(3.1416*k), t=clamp(dot(q,-dir),0.,L);
  float d=length(q+dir*t);
  return (1.-t/max(L,1e-4))*ss(max(1.7*uPR,1.3)/uRes.y,0.,d)*sin(3.1416*k);
}

vec3 wormhole(vec2 p){
  float r=length(p)+1e-3, a=atan(p.y,p.x);
  float z=.35/r+uTravel;
  float n=vn(vec2(cos(a),sin(a))*1.5+z*vec2(.9,-.6));
  float b=.5+.5*sin(TAU*(z*1.5+2.*a/TAU)+3.*n);
  vec3 c=mix(uColA,uColB,n)*b*b*b*2.2;
  c+=mix(uColA,uColB,.5)*ss(.7,1.,sin(TAU*z*3.+2.*n))*1.2;
  c*=ss(.02,.35,r);
  c+=vec3(.85,.92,1.)*exp(-r*14.)*uWorm*uWorm*1.5;
  return c;
}

void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y; float asp=uRes.x/uRes.y;
  vec2 u=gl_FragCoord.xy/uRes;
  vec3 col=vec3(0.); float keep=0.;
  if(uWorm<.995){
    vec2 q=p, bd=vec2(0.); float R=uBH.z*(1.+.18*ss(1.5,2.,uMode)), br=9., clr=1.;
    if(uBH.w>.002){ bd=p-uBH.xy; br=length(bd); float E=1.3*R; q=uBH.xy+bd*(1.-E*E/max(br*br,R*R*.6)); clr=1.-.85*min(1.,uBH.w*1.5)*ss(R*7.,R*2.,br); }
    float ripWave=0.; if(uRipple.w>.002){ vec2 rd=p-uRipple.xy; float rr=length(rd); float band=exp(-pow((rr-uRipple.z)*18.,2.))*uRipple.w; q+=normalize(rd+1e-4)*band*.045; ripWave=band; }
    float rl=length(p);
    if(uGain.y>.002) col=nebula(q,3.+uTier)*uGain.y*(1.+.09*uBass)*clr;
    col+=stars(q,p/max(rl,1e-4),uWarp*24.*rl);
    if(uPlanet.w>.002){ vec4 pl=planet(p); col=col*(1.-pl.a*uPlanet.w)+pl.rgb*uPlanet.w; keep=pl.a*uPlanet.w*ss(1.,1.5,asp); }
    if(uSun.x>.002) col=sunrise(col,p);
    if(uBH.w>.002&&br<R*7.5) col=blackhole(col,bd,br,R);
    if(uTier>.5||uShower.x>.002){
      float T=uTime/4.6, m=uTier>.5&&fract(T)<.19?meteor(p,asp,floor(T)+fract(T)/.19,7.3,.5):0.;
      if(uShower.x>.002){ for(int i=0;i<4;i++){ float fi=float(i); m+=uShower.x*meteor(p+vec2((fi-1.5)*.21*asp,.1-.07*fi),asp,uShower.y*(1.25+.17*fi)+fi*.37,11.+fi*3.1,0.); } }
      col+=vec3(.9,.95,1.)*m;
    }
    if(ripWave>.002){ col+=mix(uColA*2.4,vec3(.5,.88,1.),.55)*ripWave*1.4; }
    if(uWarp>.01){ col*=1.-.55*uWarp; col+=mix(uColA*3.,vec3(.8,.9,1.),.6)*streaks(p)*uWarp*1.65; }
  }
  if(uWorm>.005) col=mix(col,wormhole(p),ss(0.,1.,uWorm));
  col*=1.-uDim*(.3+.5*ss(.6,.2,abs(u.x-.5)));
  col=col*(1.+1.8*uFlash)+(mix(uColA,uColB,.5)*.55+vec3(.1,.11,.14))*uFlash;
  col=1.-exp(-col*1.4);
  col=pow(col,vec3(.4545));
  float v=u.x*u.y*(1.-u.x)*(1.-u.y)*16.; col*=.55+.45*pow(v,.3);
  float cap=mix(mix(uCap.x,.42,uSun.x*ss(.24,.06,u.y)),.5,keep);
  float Y=dot(col,vec3(.2126,.7152,.0722)), k0=cap*.5;
  float Yc=Y<k0?Y:k0+(cap-k0)*(1.-exp(-(Y-k0)/(cap-k0)));
  col*=mix(1.,Yc/max(Y,1e-4),uCap.y*ss(uCap.z+.08,uCap.z-.02,abs(u.x-.5)));
  col*=uGain.x;
  const vec3 BG=vec3(.0196,.0235,.0392); col+=BG*(1.-col);
  float n1=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
  float n2=fract(52.9829189*fract(dot(gl_FragCoord.xy+47.,vec2(.06711056,.00583715))));
  col+=(n1+n2-1.)/255.;
  gl_FragColor=vec4(col,1.);
}`;

  const UNIFORMS = [
    ['uRes', 2], ['uPR', 1], ['uTime', 1], ['uTravel', 1], ['uPtr', 2], ['uScroll', 1],
    ['uColA', 3], ['uColB', 3], ['uWarp', 1], ['uBH', 4], ['uPlanet', 4], ['uSun', 2],
    ['uWorm', 1], ['uBass', 1], ['uDim', 1], ['uTier', 1], ['uGain', 2], ['uFlash', 1],
    ['uShower', 2], ['uCap', 3], ['uRipple', 4], ['uMode', 1],
  ];

  /* The backdrop is soft (nebula, glows), so the lower tiers render fewer pixels and let
     the browser upscale: on integrated GPUs that is the difference between 30 and 60 fps. */
  const TIERS = [
    { dpr: 1.0, maxPx: 0.45e6 },
    { dpr: 1.0, maxPx: 0.9e6 },
    { dpr: 1.5, maxPx: 2.3e6 },
  ];
  const LADDER = [0.5, 0.6, 0.7, 0.85, 1];
  const FRAME_MS = 1000 / 60;   // never redraw faster than 60 fps (120/144 Hz screens would double the GPU work)
  const ECO_MS = 1000 / 30;     // last resort at the lowest tier and rung
  const GOV_N = 30;             // frames per governor decision
  const PRE_ENTER_GAIN = 0.35;
  const BH_PARALLAX = 0.6;
  const PLANET_PARALLAX = 0.85;
  const LUMA_CAP = 0.19;
  const MODE_NAMES = ['Standard Cosmos', 'Nebula Overdrive', 'Hyper-Singularity'];

  GK.register('cosmos', function init(GK) {
    const U = GK.util, clamp = U.clamp, damp = U.damp;
    const state = GK.state, env = GK.env, bus = GK.bus;
    const root = document.documentElement;
    const reduced = !!env.reduced;
    const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

    let canvas = document.getElementById('cosmos');
    let glCanvas = null, gl = null, prog = null, parallel = null, pending = null;
    let mode = 'idle';
    let tier = clamp(state.quality | 0, 0, 2), tierCeil = 2, userTier = false, rung = LADDER.length - 1;
    let shown = false, force = true, sizePending = true, busy = false, eco = false, drawAcc = 0;
    let fallback = null;
    let visualMode = 0, visualModeSmooth = 0;

    const view = { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight), bw: 1, bh: 1, pr: 1 };
    const anchor = { bhX: -1, bhY: -1, top1: -1, h1: 0, top9: -1, h9: 0, colPx: 0 };

    let total = 0;
    UNIFORMS.forEach(u => { total += u[1]; });
    const data = new Float32Array(total), drawn = new Float32Array(total);
    const uni = {}, views = [], locs = [];
    (function () { let o = 0; UNIFORMS.forEach(u => { const v = data.subarray(o, o + u[1]); uni[u[0]] = v; views.push(v); o += u[1]; }); })();

    let time = 0, travel = 0, intro = state.entered ? 1 : 0, entered = !!state.entered;
    let worm = 0, bass = 0, dim = state.palette.dim;
    const flash = { from: 0, peak: 0, t: 0, level: 0, on: false };
    const shower = { left: 0, clock: 0, k: 0 };
    const ripple = { x: 0, y: 0, t: 0, dur: 1.35, amp: 0, on: false };

    const gov = { last: 0, ema: 16.7, n: 0, hold: 30, refresh: 16.7, boot: [], good: 0, floorHits: 0, upAt: -1e9, lockUntil: 0, lockSpan: 30000 };

    /* ───────────────────────── public API ───────────────────────── */
    const api = (GK.cosmos = {
      ready: false,
      setQuality(q) {
        tier = clamp(Math.round(+q) || 0, 0, 2);
        if (reduced) tier = Math.min(tier, 1);
        userTier = true;
        state.quality = tier;
        eco = false;
        rung = tier === 2 ? LADDER.length - 1 : tier === 1 ? 3 : 1;
        gov.hold = 30; gov.good = 0; gov.floorHits = 0;
        sizePending = true; force = true;
      },
      cycleQuality() {
        const next = (tier + 1) % 3;
        api.setQuality(next);
        GK.sfx('toggle');
        GK.toast('Render Engine · Tier ' + next + (next === 2 ? ' (Ultra)' : next === 1 ? ' (Balanced)' : ' (Eco)'), { tone: 'info' });
        return next;
      },
      setMode(m) {
        visualMode = clamp(Math.round(+m) || 0, 0, 2);
        force = true;
        return MODE_NAMES[visualMode];
      },
      cycleMode() {
        visualMode = (visualMode + 1) % 3;
        force = true;
        api.ripple(view.w / 2, view.h / 2, 0.95);
        GK.sfx('discover');
        GK.toast('Cosmos Mode · ' + MODE_NAMES[visualMode], { tone: 'ok' });
        return MODE_NAMES[visualMode];
      },
      getModeName() {
        return MODE_NAMES[visualMode] || MODE_NAMES[0];
      },
      flash(amount) {
        if (reduced) return;
        const a = clamp(amount == null ? 0.5 : +amount || 0);
        if (a <= 0) return;
        flash.from = flash.level; flash.peak = Math.max(a, flash.level); flash.t = 0; flash.on = true;
      },
      shower(seconds) {
        if (reduced) return;
        const s = clamp(+seconds || 2, 0.5, 12);
        if (shower.left <= 0) shower.clock = 0;
        shower.left = Math.max(shower.left, s);
      },
      ripple(clientX, clientY, strength) {
        if (reduced) return;
        const cx = typeof clientX === 'number' ? clientX : view.w / 2;
        const cy = typeof clientY === 'number' ? clientY : view.h / 2;
        ripple.x = (cx - view.w / 2) / Math.max(1, view.h);
        ripple.y = (view.h / 2 - cy) / Math.max(1, view.h);
        ripple.t = 0;
        ripple.amp = clamp(strength == null ? 0.85 : +strength || 0.85, 0.1, 1.5);
        ripple.on = true;
        force = true;
      },
      stats() {
        return { fps: Math.round(1000 / Math.max(1, gov.ema)), scale: Math.round(view.pr * 100) / 100, tier: tier, eco: eco, lite: !!env.lite, mode: MODE_NAMES[visualMode], webgl: mode === 'run' || mode === 'compile' };
      },
      _draw(dt) { tick(state, dt == null ? 1 / 60 : dt); return api.stats(); },
    });

    function announce(webgl) {
      if (api.ready) return;
      api.ready = true;
      GK.ready(() => bus.emit('cosmos:ready', { webgl: webgl, tier: tier }));
    }
    function reveal(target) {
      shown = true;
      target.style.opacity = '1';
    }
    /* light path for the rest of the site (header blur, 2D canvases, audio): switched on
       when the governor has to drop to tier 0. One-way, so it never flip-flops. */
    function goLite() {
      if (env.lite) return;
      env.lite = true;
      root.classList.add('is-lite');
      bus.emit('lite', { lite: true });
    }

    if (!canvas) { mode = 'fallback'; state.quality = 0; announce(false); return; }

    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 1.1s cubic-bezier(0.22, 0.61, 0.36, 1)';
    if (window.CSS && CSS.supports && CSS.supports('height', '100lvh')) canvas.style.height = '100lvh';

    function measureAnchors() {
      const panels = GK.scroll.panels();
      let p0 = null;
      anchor.top1 = anchor.top9 = -1;
      for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        if (p.index === 0) p0 = p;
        else if (p.index === 3) { anchor.top1 = GK.scroll.topOf(3); anchor.h1 = p.height; }
        else if (p.index === 9) { anchor.top9 = GK.scroll.topOf(9); anchor.h9 = p.height; }
      }
      anchor.bhX = -1;
      anchor.bhY = p0 ? p0.top + p0.height / 2 : -1;
      const name = document.getElementById('heroName');
      if (name) {
        const r = name.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) { anchor.bhX = r.left + r.width / 2; anchor.bhY = r.top + window.scrollY + r.height / 2; }
      }
      const inner = document.querySelector('.panel[data-sector="2"] .panel-inner') || document.querySelector('.panel-inner');
      const r = inner ? inner.getBoundingClientRect() : null;
      anchor.colPx = r && r.width > 0 ? r.width : 0;
      force = true;
    }

    function readSize() {
      const c = fallback ? fallback.canvas : canvas;
      const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
      if (env.touch && !env.fine && w === view.w && Math.abs(h - view.h) < 120 && view.bw > 1) return;
      view.w = Math.max(1, w); view.h = Math.max(1, h);
    }

    bus.on('measure', measureAnchors);
    bus.on('resize', () => {
      readSize();
      sizePending = true; force = true; gov.hold = 30;
      if (fallback) paintFallback();
    });
    bus.on('visibility', () => { gov.hold = 30; gov.last = 0; });
    bus.on('sector', () => { if (fallback) paintFallback(); });
    bus.on('enter', () => { entered = true; force = true; });

    /* ───────────────────────── static fallback (only if WebGL unavailable) ───────────────────────── */
    function showFallback() {
      root.classList.add('no-gl');
      if (!fallback) {
        let c = canvas, ctx = null;
        try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
        if (!ctx) {
          c = canvas.cloneNode(false);
          if (canvas.parentNode) canvas.parentNode.replaceChild(c, canvas);
          try { ctx = c.getContext('2d'); } catch (e) { ctx = null; }
        }
        fallback = { canvas: c, ctx: ctx };
      }
      paintFallback();
      reveal(fallback.canvas);
      announce(false);
    }
    function useFallback() {
      mode = 'fallback';
      state.quality = tier = 0;
      showFallback();
    }

    function paintFallback() {
      if (!fallback || !fallback.ctx) return;
      const c = fallback.canvas, ctx = fallback.ctx;
      const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.max(2, Math.round(w * dpr));
      c.height = Math.max(2, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#05060A';
      ctx.fillRect(0, 0, w, h);

      const sec = GK.SECTORS[state.sector] || GK.SECTORS[0];
      const span = Math.max(w, h);
      const glow = (x, y, radius, rgb, alpha) => {
        const col = Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255);
        const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
        g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
        g.addColorStop(0.5, 'rgba(' + col + ',' + alpha * 0.32 + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      glow(w * 0.74, h * 0.2, span * 0.62, sec.rgbA, 0.16);
      glow(w * 0.16, h * 0.86, span * 0.5, sec.rgbB, 0.10);

      let seed = 0x9E3779B9;
      const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const count = clamp(Math.round((w * h) / 4000), 120, 560);
      for (let i = 0; i < count; i++) {
        const x = rnd() * w, y = rnd() * h, b = Math.pow(rnd(), 5), warm = rnd();
        ctx.fillStyle = 'rgba(' + Math.round(158 + 97 * warm) + ',' + Math.round(199 - 10 * warm) + ',' + Math.round(255 - 122 * warm) + ',' + (0.2 + 0.8 * b).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, 0.45 + 1.15 * b, 0, 6.2832);
        ctx.fill();
      }

      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
      vg.addColorStop(0, 'rgba(5,6,10,0)');
      vg.addColorStop(1, 'rgba(5,6,10,0.62)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }

    /* ───────────────────────── WebGL setup ───────────────────────── */
    function createContext() {
      const base = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
      const strictOpts = Object.assign({}, base, { failIfMajorPerformanceCaveat: true });
      try {
        const ctx1 = canvas.getContext('webgl', strictOpts) || canvas.getContext('experimental-webgl', strictOpts);
        if (ctx1) return ctx1;
      } catch (e) {}
      try {
        return canvas.getContext('webgl', base) || canvas.getContext('experimental-webgl', base);
      } catch (e) { return null; }
    }

    function startCompile() {
      const make = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const vs = make(gl.VERTEX_SHADER, VERT), fs = make(gl.FRAGMENT_SHADER, FRAG);
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      parallel = gl.getExtension('KHR_parallel_shader_compile');
      pending = { vs: vs, fs: fs, frames: 0 };
      mode = 'compile';
    }

    function pollCompile() {
      pending.frames++;
      if (parallel ? !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR) : pending.frames < 2) return;
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        if (gl.isContextLost()) return;
        console.error('[GK] cosmos shader failed to build\n' + (gl.getShaderInfoLog(pending.vs) || '') + '\n' + (gl.getShaderInfoLog(pending.fs) || '') + '\n' + (gl.getProgramInfoLog(prog) || ''));
        useFallback();
        return;
      }
      gl.deleteShader(pending.vs);
      gl.deleteShader(pending.fs);
      pending = null;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      locs.length = 0;
      UNIFORMS.forEach(u => locs.push(gl.getUniformLocation(prog, u[0])));
      tierCeil = (env.touch && !env.fine) || reduced ? 1 : 2;
      if (!userTier) tier = Math.min(tier, tierCeil);
      state.quality = tier;
      rung = tier === 2 ? LADDER.length - 1 : 3;
      sizePending = true; force = true;
      gov.hold = 35; gov.last = 0;
      mode = 'run';
    }

    function upload() {
      for (let i = 0; i < UNIFORMS.length; i++) {
        const loc = locs[i];
        if (!loc) continue;
        const n = UNIFORMS[i][1], v = views[i];
        if (n === 1) gl.uniform1f(loc, v[0]);
        else if (n === 2) gl.uniform2fv(loc, v);
        else if (n === 3) gl.uniform3fv(loc, v);
        else gl.uniform4fv(loc, v);
      }
    }

    function applySize() {
      sizePending = false;
      const T = TIERS[tier];
      let pr = Math.min(window.devicePixelRatio || 1, T.dpr) * LADDER[rung];
      const px = view.w * view.h * pr * pr;
      if (px > T.maxPx) pr *= Math.sqrt(T.maxPx / px);
      const bw = Math.max(2, Math.round(view.w * pr)), bh = Math.max(2, Math.round(view.h * pr));
      if (glCanvas.width !== bw || glCanvas.height !== bh) { glCanvas.width = bw; glCanvas.height = bh; }
      gl.viewport(0, 0, bw, bh);
      view.bw = bw; view.bh = bh; view.pr = bw / view.w;
    }

    function govern(now) {
      const ft = now - gov.last;
      gov.last = now;
      if (ft <= 0 || ft > 100) { gov.hold = Math.max(gov.hold, 8); return; }
      if (gov.hold > 0) { gov.hold--; return; }
      if (gov.boot) {
        gov.boot.push(ft);
        if (gov.boot.length >= 20) {
          gov.boot.sort((a, b) => a - b);
          const med = gov.boot[10];
          gov.refresh = med > 20 ? 16.7 : clamp(med, 4, 16.7);
          gov.ema = Math.max(med, gov.refresh);
          gov.boot = null;
        }
        return;
      }
      gov.ema += (ft - gov.ema) * 0.08;
      if (++gov.n < GOV_N) return;
      gov.n = 0;
      if (busy || userTier) { gov.good = 0; return; }

      /* step down below ~50 fps; eco (30 fps cap) is the rung under the lowest one */
      if (gov.ema > Math.max(19.5, gov.refresh * 1.2)) {
        gov.good = 0;
        if (now - gov.upAt < 3000) {
          gov.lockUntil = now + gov.lockSpan;
          gov.lockSpan = Math.min(240000, gov.lockSpan * 2);
        }
        if (rung > 0) { rung--; gov.floorHits = 0; }
        else if (++gov.floorHits >= 2 && tier > 0) { tier--; rung = 2; gov.floorHits = 0; state.quality = tier; if (tier === 0) goLite(); }
        else if (tier === 0 && !eco && gov.floorHits >= 2) { eco = true; gov.floorHits = 0; }
        else return;
      } else if (gov.ema < gov.refresh * 1.06 + 0.4) {
        gov.good += GOV_N * gov.ema;
        if (gov.good < 5000 || now < gov.lockUntil) return;
        gov.good = 0;
        if (eco) eco = false;
        else if (rung < LADDER.length - 1) rung++;
        else if (tier < tierCeil) { tier++; rung = 2; state.quality = tier; }
        else return;
        gov.upAt = now;
      } else { gov.good = 0; return; }
      sizePending = true; force = true; gov.hold = 30;
    }

    function overlayOpen() {
      if (state.modalOpen || state.paused) return true;
      if ((GK.modal && GK.modal.isOpen) || (GK.palette && GK.palette.isOpen)) return true;
      const f = GK.flow;
      if (f && typeof f.overlayOpen === 'function') { try { return !!f.overlayOpen(); } catch (e) { return false; } }
      return false;
    }

    function linear(src, out) {
      const r = Math.pow(clamp(src[0]), 2.2), g = Math.pow(clamp(src[1]), 2.2), b = Math.pow(clamp(src[2]), 2.2);
      const k = 0.1 / Math.max(0.02, 0.2126 * r + 0.7152 * g + 0.0722 * b);
      out[0] = r * k; out[1] = g * k; out[2] = b * k;
    }

    function integrate(st, dt, overlay) {
      const vw = view.w, vh = view.h, asp = vw / vh, sy = st.scrollY;
      const ptr = st.pointer;

      const wormT = sstep(0, 0.7, st.wormhole);
      worm = wormT >= worm ? wormT : Math.max(wormT, damp(worm, wormT, 4.2, dt));
      if (worm < 0.003) worm = 0;
      const warp = reduced ? 0 : Math.max(st.warp, 0.3 * sstep(0.3, 1, st.speed));

      if (!reduced) {
        time += dt;
        travel += dt * (0.05 + 2 * warp + 1.2 * worm);
        if ((time > 1800 && (warp > 0.9 || worm > 0.99)) || time > 7200) time = 0;
        if (travel > 6000) travel -= 6000;
        const b = clamp(st.audio.bass || 0);
        bass = damp(bass, b, b > bass ? 18 : 3.5, dt);
      }
      if (entered && intro < 1) intro = reduced ? 1 : Math.min(1, intro + dt / 1.8);
      const bloom = intro * intro * (3 - 2 * intro);
      visualModeSmooth = reduced ? visualMode : damp(visualModeSmooth, visualMode, 4.5, dt);

      dim = damp(dim, overlay ? Math.max(st.palette.dim, 0.86) : st.palette.dim, 5, dt);

      if (flash.on) {
        flash.t += dt;
        if (flash.t < 0.15) flash.level = flash.from + (flash.peak - flash.from) * sstep(0, 0.15, flash.t);
        else { const x = clamp((flash.t - 0.15) / 0.4); flash.level = flash.peak * (1 - x) * (1 - x); if (x >= 1) { flash.on = false; flash.level = 0; } }
      }
      if (shower.left > 0) {
        shower.left -= dt; shower.clock += dt;
        shower.k = shower.left > 0 ? Math.min(1, shower.clock / 0.25) * Math.min(1, shower.left / 0.6) : 0;
      }
      if (ripple.on) {
        ripple.t += dt;
        const rp = ripple.t / ripple.dur;
        if (rp >= 1) { ripple.on = false; uni.uRipple.set([0, 0, 0, 0]); }
        else {
          uni.uRipple[0] = ripple.x;
          uni.uRipple[1] = ripple.y;
          uni.uRipple[2] = U.easeOutCubic(rp) * 1.15;
          uni.uRipple[3] = (1 - rp) * (1 - rp) * ripple.amp;
        }
      } else { uni.uRipple[3] = 0; }

      uni.uRes[0] = view.bw; uni.uRes[1] = view.bh;
      uni.uPR[0] = view.pr;
      uni.uTime[0] = time;
      uni.uTravel[0] = travel;
      if (env.fine && !reduced) { uni.uPtr[0] = ptr.sx; uni.uPtr[1] = -ptr.sy; } else { uni.uPtr[0] = uni.uPtr[1] = 0; }
      uni.uScroll[0] = sy / vh;
      linear(st.palette.a, uni.uColA);
      linear(st.palette.b, uni.uColB);
      uni.uWarp[0] = warp;
      uni.uWorm[0] = worm;
      uni.uBass[0] = bass;
      uni.uDim[0] = dim * (1 - worm);
      uni.uTier[0] = tier;
      uni.uGain[0] = PRE_ENTER_GAIN + (1 - PRE_ENTER_GAIN) * bloom;
      uni.uGain[1] = bloom;
      uni.uFlash[0] = flash.level;
      uni.uShower[0] = shower.k; uni.uShower[1] = shower.clock;
      uni.uMode[0] = visualModeSmooth;

      const grow = U.easeOutCubic(clamp((intro - 0.06) / 0.94));
      const fade = 1 - sstep(0.42, 0.97, sy / vh);
      const bhK = grow * fade;
      if (bhK > 0.002 && anchor.bhY >= 0) {
        const bx = anchor.bhX >= 0 ? anchor.bhX : vw / 2;
        uni.uBH[0] = (bx - vw / 2) / vh + uni.uPtr[0] * 0.006;
        uni.uBH[1] = (vh / 2 - (anchor.bhY - sy * BH_PARALLAX)) / vh + 0.03 + uni.uPtr[1] * 0.006;
        uni.uBH[2] = 0.12 * Math.min(1, asp * 1.1) * grow * Math.sqrt(fade);
        uni.uBH[3] = bhK;
      } else uni.uBH[3] = 0;

      uni.uPlanet[3] = 0;
      if (anchor.top1 >= 0) {
        const d = (sy - Math.max(0, anchor.top1 + (anchor.h1 - vh) / 2)) / vh;
        const k = 1 - sstep(0.8, 1.05, Math.abs(d));
        if (k > 0.002) {
          const R = 0.2 * Math.min(1, asp * 0.8), wide = asp >= 1;
          uni.uPlanet[0] = 0.5 * asp - (wide ? 0.85 : 0.55) * R - uni.uPtr[0] * 0.025;
          uni.uPlanet[1] = (wide ? -0.13 : 0.31) + d * PLANET_PARALLAX - uni.uPtr[1] * 0.025;
          uni.uPlanet[2] = R;
          uni.uPlanet[3] = k;
        }
      }

      uni.uSun[0] = 0; uni.uSun[1] = -0.56;
      if (anchor.top9 >= 0) {
        const d = (sy - Math.max(0, anchor.top9 + (anchor.h9 - vh) / 2)) / vh;
        const rise = sstep(-0.9, -0.05, d);
        uni.uSun[0] = rise * (1 - worm);
        uni.uSun[1] = -0.56 + 0.16 * rise + 0.06 * st.wormhole;
      }

      const colPx = anchor.colPx > 0 ? anchor.colPx : Math.min(1180, vw - 2 * clamp(vw * 0.04, 20, 48));
      uni.uCap[0] = LUMA_CAP;
      uni.uCap[1] = sstep(0.3, 0.5, dim) * (1 - worm) * (1 - 0.8 * flash.level);
      uni.uCap[2] = clamp(colPx / 2 / vw, 0.1, 0.5);

      busy = warp > 0.05 || worm > 0.05;
    }

    function same() {
      for (let i = 0; i < total; i++) if (data[i] !== drawn[i]) return false;
      return true;
    }

    function tick(st, dt) {
      if (mode === 'compile') { pollCompile(); return; }
      if (mode !== 'run') return;

      const overlay = overlayOpen();
      if (!reduced) govern(performance.now());
      if (sizePending) applySize();
      integrate(st, dt, overlay);

      if (reduced) { if (!force && same()) return; }
      else if (!force) {
        /* time keeps integrating every tick; only the GPU draw is paced (half rate under overlays) */
        const gap = (eco ? ECO_MS : FRAME_MS) * (overlay ? 2 : 1);
        drawAcc += dt * 1000;
        if (drawAcc + 2 < gap) return;
        drawAcc = Math.min(Math.max(0, drawAcc - gap), gap);
      }
      if (force) drawAcc = 0;

      force = false;
      upload();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drawn.set(data);

      if (!shown) {
        reveal(glCanvas);
        if (fallback) {
          if (fallback.canvas.parentNode) fallback.canvas.parentNode.replaceChild(glCanvas, fallback.canvas);
          fallback = null;
          root.classList.remove('no-gl');
        }
        announce(true);
      }
    }

    readSize();
    measureAnchors();
    GK.ticker.add(tick, 0);

    gl = env.webgl === false ? null : createContext();
    if (gl) {
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!hp || hp.precision <= 0) gl = null;
    }
    if (!gl) { useFallback(); return; }

    glCanvas = canvas;
    glCanvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      if (mode === 'fallback') return;
      prog = null; pending = null; shown = false;
      showFallback();
      mode = 'lost';
    });
    glCanvas.addEventListener('webglcontextrestored', () => { if (mode === 'lost') startCompile(); });
    startCompile();
  });
})();
