/* SekolahHub: logika aplikasi (antarmuka, aturan tabungan, voting, laporan). Data dikelola oleh data.js */
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
rp=n=>'Rp '+Math.round(+n||0).toLocaleString('id-ID'),uid=()=>Math.random().toString(36).slice(2,10),
today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},
fd=d=>d?new Date(d+'T00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):'-';
const KEY='sekolahhub.v1';let db,Q='',T=null,RK='';
const ROLEL={admin:'Admin',pengurus:'Pengurus',viewer:'Hanya lihat',ortu:'Orang tua',siswa:'Siswa',pending:'Menunggu'};const portal=()=>Data.role=='ortu'||Data.role=='siswa';
/* Akun Siswa: semua menu Keuangan dan Kelas dibuka (hanya-baca, tampilan khusus di js/siswa.js). Orang tua tetap: portal, pengumuman, agenda. */
const SWIDS=['portal','tabungan','kas','iuran','pengingat','siswa','struktur','absensi','agenda','pengumuman','voting'];
const PORTAL_OK=()=>Data.role=='siswa'?[...SWIDS,'profil','menu']:['portal','pengumuman','agenda','profil','menu'];
const vw=c=>Data.role=='siswa'&&window.SWV&&SWV.v[c]?SWV.v[c]:V[c];
const logA=m=>{(db.log=db.log||[]).unshift({t:Date.now(),m:String(m).replace(/<[^>]*>/g,'')});db.log.length=Math.min(db.log.length,150)};let LG=0,KF='',RB='',PID='',PT='linimasa';
const umur=t=>{if(!t)return'';const b=new Date(t+'T00:00'),n=new Date();let y=n.getFullYear()-b.getFullYear(),m=n.getMonth()-b.getMonth();if(n.getDate()<b.getDate())m--;if(m<0){y--;m+=12}return y<0?'':y+' tahun'+(m?' '+m+' bulan':'')};
let D={};const op=a=>a.map(x=>[x,x||'Pilih']);
const UF=[['Data pribadi',[{k:'nama',l:'Nama lengkap',r:1},{k:'nisn',l:'NISN'},{k:'nis',l:'NIS',r:1},{k:'kelas',l:'Kelas',r:1},{k:'jk',l:'Jenis kelamin',t:'select',o:op(['','Laki-laki','Perempuan'])},{k:'tl',l:'Tempat lahir'},{k:'tgl',l:'Tanggal lahir',t:'date'},{k:'agama',l:'Agama',t:'select',o:op(['','Islam','Kristen','Katolik','Hindu','Buddha','Konghucu'])},{k:'gol',l:'Golongan darah',t:'select',o:op(['','A','B','AB','O'])}]],['Kontak dan alamat',[{k:'hp',l:'Kontak wali (HP/WA)',t:'tel'},{k:'alamat',l:'Alamat lengkap',t:'area'}]],['Orang tua / wali',[{k:'ayah',l:'Nama ayah'},{k:'ibu',l:'Nama ibu'},{k:'wali',l:'Nama wali (jika ada)'},{k:'pkj',l:'Pekerjaan orang tua / wali'}]],['Tentang siswa',[{k:'bio',l:'Bio singkat',t:'area'},{k:'hobi',l:'Hobi'},{k:'cita',l:'Cita-cita'},{k:'masuk',l:'Tanggal masuk sekolah',t:'date'},{k:'target',l:'Target tabungan (Rp, opsional)',t:'number'},{k:'kes',l:'Catatan kesehatan / alergi',t:'area'}]]];
const AVP=['#1d7470','#4a5bd0','#8a6100','#a23c72','#2a7a50','#2a6f90'],avc=n=>AVP[hue(n)%6];
const hue=n=>[...String(n)].reduce((a,c)=>a+c.charCodeAt(0)*7,0)%360,
av=(s,n)=>{const sp=`<span class='av' style='width:${n}px;height:${n}px;font-size:${Math.round(n*.38)}px;background:${avc(s.nama)}'>${esc((s.nama||'?').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span>`;return Data.url(s.foto)?`<img class='av' src='${Data.url(s.foto)}' width='${n}' height='${n}' alt='' data-fb="${encodeURIComponent(sp)}" onerror="this.outerHTML=decodeURIComponent(this.dataset.fb)">`:sp};
const kfs=()=>`<select onchange="KF=this.value;$('#tb').innerHTML=T()"><option value=''>Semua kelas</option>${kelasList().map(k=>`<option ${k==KF?'selected':''}>${esc(k)}</option>`).join('')}</select>`;
function load(d){db=d}
function save(){syncKas();Data.push(db)}
function toast(m){const t=$('#toast');t.textContent=m;t.className='on';clearTimeout(toast.h);toast.h=setTimeout(()=>t.className='',2200)}
const sis=id=>db.siswa.find(s=>s.id==id)||{nama:'(dihapus)',kelas:'-',nis:'-'},
saldo=id=>db.tab.filter(t=>t.sid==id).reduce((a,t)=>a+(t.jenis=='setor'?1:-1)*t.jml,0),
total=()=>db.siswa.reduce((a,s)=>a+saldo(s.id),0),
kasSaldo=()=>db.kas.reduce((a,k)=>a+(k.jenis=='masuk'?1:-1)*k.jml,0),
kelasList=()=>[...new Set(db.siswa.map(s=>s.kelas))].sort(),
sopt=()=>db.siswa.map(s=>[s.id,s.nama+' ('+s.kelas+')']);
const empty=m=>`<div class="empty">${m}</div>`;
function tbl(h,rows,m){return rows.length?`<div class="tw"><table><tr>${h.map(x=>`<th class="${x[0]=='>'?'r':''}">${x.replace(/^>/,'')}</th>`).join('')}</tr>${rows.join('')}</table></div>`:empty(m)}
/* ---------- dialog helpers ---------- */
function fld(f,v){const x=v[f.k]??f.d??'';const id='f_'+f.k;
if(f.t=='select')return`<label>${f.l}<select id="${id}">${f.o.map(o=>`<option value="${o[0]}" ${o[0]==x?'selected':''}>${esc(o[1])}</option>`).join('')}</select></label>`;
if(f.t=='area')return`<label>${f.l}<textarea id="${id}" rows="3">${esc(x)}</textarea></label>`;
if(f.t=='multi')return`<label>${f.l}</label>${f.o.map(o=>`<label class="chk"><input type="checkbox" name="${f.k}" value="${o[0]}" ${(x||[]).includes(o[0])?'checked':''}>${esc(o[1])}</label>`).join('')}`;
return`<label>${f.l}<input id="${id}" type="${f.t||'text'}" value="${esc(x)}" ${f.t=='number'?'min="1" inputmode="numeric"':''}></label>`}
function form(title,fields,v,cb,ok='Simpan'){const d=$('#dlg');
d.innerHTML=`<h3>${title}</h3>${fields.map(f=>fld(f,v)).join('')}<div class="mu no" id="err" style="color:var(--er);margin-bottom:6px"></div><div class="acts"><button id="x">Batal</button><button class="p" id="ok">${ok}</button></div>`;
d.showModal();$('#x').onclick=()=>d.close();
$('#ok').onclick=()=>{const o={};for(const f of fields){if(f.t=='multi')o[f.k]=[...d.querySelectorAll(`[name=${f.k}]:checked`)].map(i=>i.value);else{o[f.k]=$('#f_'+f.k).value.trim();if(f.r&&!o[f.k]){$('#err').textContent=f.l+' wajib diisi.';return}}}
const e=cb(o);if(e){$('#err').textContent=e;return}if(!LG)logA(title);LG=0;save();d.close();go()}}
function ask(m,cb){const d=$('#dlg');d.innerHTML=`<h3>Konfirmasi</h3><p>${m}</p><div class="acts"><button id="x">Batal</button><button class="p" id="ok">Ya, lanjutkan</button></div>`;d.showModal();$('#x').onclick=()=>d.close();$('#ok').onclick=()=>{cb();logA(m.replace(/\?.*$/,''));save();d.close();go();toast('Berhasil')}}
/* ---------- views ---------- */
const V={};
/* ===== Dasbor gaya layar data: cincin, radar, area halus, indikator, ranking ===== */
let DR=12;
const DC={
  sm(p){return p.map((q,i)=>{if(!i)return'M'+q;const a=p[i-2]||p[i-1],b=p[i-1],d=p[i+1]||q;return`C${b[0]+(q[0]-a[0])/6},${b[1]+(q[1]-a[1])/6} ${q[0]-(d[0]-b[0])/6},${q[1]-(d[1]-b[1])/6} ${q[0]},${q[1]}`}).join(' ')},
  smooth(lb,ser,H=230){const W=CW(),pl=44,pr=14,pt=14,pb=28,iw=W-pl-pr,ih=H-pt-pb,mx=CH.nice(Math.max(1000,...ser.flatMap(s=>s.v))),n=lb.length,px=i=>pl+(n>1?iw*i/(n-1):iw/2),py=x=>pt+ih-ih*Math.max(0,x)/mx;
    let g=`<defs>${ser.map((s,k)=>`<linearGradient id='dg${k}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:${s.c};stop-opacity:.55'/><stop offset='1' style='stop-color:${s.c};stop-opacity:0'/></linearGradient>`).join('')}<clipPath id='dcp'><rect x='${pl}' y='${pt-4}' width='${iw}' height='${ih+4}'/></clipPath></defs>`+CH.grid(W,pl,pr,pt,ih,mx);
    lb.forEach((l,i)=>{if(n<=7||i%2==0||i==n-1)g+=`<text x='${px(i)}' y='${H-8}' text-anchor='middle' class='ct'>${esc(l)}</text>`});
    ser.forEach((s,k)=>{const d=DC.sm(s.v.map((x,i)=>[px(i),py(x)]));g+=`<g clip-path='url(#dcp)'><path d='${d} L${px(n-1)},${pt+ih} L${px(0)},${pt+ih}Z' style='fill:url(#dg${k})'/><path d='${d}' style='fill:none;stroke:${s.c};stroke-width:2.5;stroke-linecap:round;filter:drop-shadow(0 0 4px ${s.c})'/></g>`});
    lb.forEach((l,i)=>{g+=`<rect x='${px(i)-iw/n/2}' y='${pt}' width='${iw/n}' height='${ih}' style='fill:transparent'><title>${esc(l)}: ${ser.map(s=>s.n+' '+rp(s.v[i])).join(' · ')}</title></rect>`});
    return`<svg viewBox='0 0 ${W} ${H}' class='chart' role='img'>${g}</svg>`+CH.leg(ser)},
  gauge(p,c,l,sub){const R=46,C=2*Math.PI*R,f=Math.max(0,Math.min(100,p))/100*C;
    return`<div class='gg'><svg viewBox='0 0 120 120' class='gauge' role='img'><circle cx='60' cy='60' r='${R}' fill='none' stroke-width='9' class='trk'/><circle cx='60' cy='60' r='${R}' fill='none' stroke-width='9' stroke-linecap='round' stroke-dasharray='${f} ${C}' transform='rotate(-90 60 60)' style='stroke:${c};opacity:${p>0?1:0};filter:drop-shadow(0 0 5px ${c})'/><text x='60' y='63' text-anchor='middle' class='gv' style='fill:${c}'>${Math.round(p)}%</text><text x='60' y='82' text-anchor='middle' class='ct' style='fill:var(--tx)'>${l}</text></svg><div class='gs'>${sub}</div></div>`},
  rings(rows){const t=rows.reduce((a,x)=>a+x.v,0),mx=Math.max(1,...rows.map(x=>x.v));if(!rows.length||!t)return empty('Belum ada data tabungan.');let s='';
    rows.forEach((x,i)=>{const R=66-i*15,C=2*Math.PI*R;s+=`<circle cx='80' cy='80' r='${R}' fill='none' stroke-width='10' stroke-dasharray='${C*.75} ${C}' transform='rotate(-90 80 80)' class='trk'/><circle cx='80' cy='80' r='${R}' fill='none' stroke-width='10' stroke-linecap='round' stroke-dasharray='${C*.75*x.v/mx} ${C}' transform='rotate(-90 80 80)' style='stroke:${x.c};filter:drop-shadow(0 0 4px ${x.c})'><title>${esc(x.n)}: ${rp(x.v)}</title></circle>`});
    return`<div class='rg'><svg viewBox='0 0 160 160' class='rings' role='img'>${s}</svg><div class='rl'>${rows.map(x=>`<div><b style='color:${x.c}'>${Math.round(x.v/t*100)}%</b><span>${esc(x.n)}</span></div>`).join('')}</div></div>`},
  radar(ax){const cx=130,cy=98,R=62,n=ax.length,an=i=>-Math.PI/2+2*Math.PI*i/n,pt=(i,r)=>[cx+r*Math.cos(an(i)),cy+r*Math.sin(an(i))],cl=v=>Math.max(0,Math.min(100,v))/100;let g='';
    [.25,.5,.75,1].forEach(f=>g+=`<polygon points='${ax.map((_,i)=>pt(i,R*f).join(',')).join(' ')}' fill='none' class='gl'/>`);
    ax.forEach((a,i)=>{const[x,y]=pt(i,R),[lx,ly]=pt(i,R+13),co=Math.cos(an(i));g+=`<line x1='${cx}' y1='${cy}' x2='${x}' y2='${y}' class='gl'/><text x='${lx}' y='${ly+4}' text-anchor='${Math.abs(co)<.3?'middle':co>0?'start':'end'}' class='ct'>${esc(a.n)}</text>`});
    g+=`<defs><linearGradient id='rdg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' style='stop-color:var(--pr);stop-opacity:.75'/><stop offset='1' style='stop-color:var(--pr2);stop-opacity:.55'/></linearGradient></defs><polygon points='${ax.map((a,i)=>pt(i,R*cl(a.v)).join(',')).join(' ')}' style='fill:url(#rdg);stroke:var(--pr);stroke-width:2'/>`+ax.map((a,i)=>{const[x,y]=pt(i,R*cl(a.v));return`<circle cx='${x}' cy='${y}' r='3' style='fill:var(--pr)'><title>${esc(a.n)}: ${Math.round(a.v)}%</title></circle>`}).join('');
    return`<svg viewBox='0 0 260 200' class='chart' role='img'>${g}</svg>`},
  donutL(p){const t=p.reduce((a,x)=>a+x.v,0),cx=150,cy=96,R=44,C=2*Math.PI*R;let off=0,s='',lab='';
    p.filter(x=>x.v>0).forEach(x=>{const l=C*x.v/t,m=-Math.PI/2+2*Math.PI*(off+l/2)/C,co=Math.cos(m),si=Math.sin(m),x1=cx+(R+12)*co,y1=cy+(R+12)*si,x2=cx+(R+24)*co,y2=cy+(R+24)*si,x3=x2+(co>=0?14:-14);
      s+=`<circle cx='${cx}' cy='${cy}' r='${R}' fill='none' stroke-width='20' style='stroke:${x.c}' stroke-dasharray='${Math.max(.1,l-1.5)} ${C}' stroke-dashoffset='${-off}' transform='rotate(-90 ${cx} ${cy})'><title>${esc(x.n)}: ${x.v}</title></circle>`;
      lab+=`<polyline points='${x1},${y1} ${x2},${y2} ${x3},${y2}' fill='none' style='stroke:${x.c}' stroke-width='1'/><text x='${x3+(co>=0?4:-4)}' y='${y2+4}' text-anchor='${co>=0?'start':'end'}' class='ct' style='fill:var(--tx)'>${esc(x.n)} ${x.v}</text>`;off+=l});
    return`<svg viewBox='0 0 300 190' class='chart' role='img'><circle cx='${cx}' cy='${cy}' r='${R}' fill='none' stroke-width='20' class='trk'/>${s}${lab}</svg>`},
  rank(rows){const mx=Math.max(1,...rows.map(r=>r.v));return rows.length?`<div class='rk'>${rows.map(r=>`<div><div class='rt'><span>${esc(r.n)}</span><b>${CH.short(r.v)}</b></div><i style='width:${Math.max(3,Math.max(0,r.v)/mx*100)}%'></i></div>`).join('')}</div>`:empty('Belum ada data.')},
  mini(lb,v,H=170){const W=300,pl=38,pr=8,pt=10,pb=26,iw=W-pl-pr,ih=H-pt-pb,mx=CH.nice(Math.max(1000,...v)),gw=iw/lb.length,bw=gw*.55;
    let g=`<defs><linearGradient id='mgr' x1='0' y1='0' x2='0' y2='1'><stop offset='0' style='stop-color:var(--ok);stop-opacity:.95'/><stop offset='1' style='stop-color:var(--ok);stop-opacity:.15'/></linearGradient></defs>`+CH.grid(W,pl,pr,pt,ih,mx);
    lb.forEach((l,i)=>{const cx=pl+gw*i+gw/2,bh=ih*v[i]/mx;g+=`<text x='${cx}' y='${H-8}' text-anchor='middle' class='ct'>${l}</text><rect x='${cx-bw/2}' y='${pt+ih-bh}' width='${bw}' height='${v[i]?Math.max(bh,2):0}' rx='2' style='fill:url(#mgr)'><title>${l}: ${rp(v[i])}</title></rect>`});
    return`<svg viewBox='0 0 ${W} ${H}' class='chart' role='img'>${g}</svg>`}
};
const pill=(p,k)=>p==null?'':`<span class='pill ${k}'>${Math.abs(p)}% ${p>=0?'▲':'▼'}</span>`;

V.dashboard=()=>{
  const m0=mk(0),m1=mk(-1),sm=tabM(m0,'setor'),sp=tabM(m1,'setor'),tp=tabM(m0,'tarik'),tp1=tabM(m1,'tarik'),tot=total(),dTot=tot-net(m1),
  pct=sp?Math.round((sm-sp)/sp*100):null,pct2=tp1?Math.round((tp-tp1)/tp1*100):null,N=db.siswa.length,pc=a=>N?a/N*100:0,
  nom=+db.cfg.iuran||0,belum=db.siswa.filter(s=>!db.tab.some(t=>t.sid==s.id&&t.jenis=='setor'&&t.tgl.slice(0,7)==m0)),
  pm=db.siswa.map(s=>paidWeek(s.id)),lunas=nom?pm.filter(x=>x>=nom).length:0,
  ab=db.absensi.filter(a=>a.tgl.slice(0,7)==m0),ac=k=>ab.filter(a=>a.st==k).length,hari=db.absensi.filter(a=>a.tgl==today()),
  att=ab.length?ac('H')/ab.length*100:0,iu=pc(lunas),mn=pc(N-belum.length),
  tg=db.siswa.filter(s=>+s.target>0),tgt=tg.length?tg.reduce((a,s)=>a+Math.min(Math.max(0,saldo(s.id)),+s.target),0)/tg.reduce((a,s)=>a+ +s.target,0)*100:0,
  lg=pc(db.siswa.filter(s=>s.tgl&&s.alamat&&s.hp).length),
  mR=[...Array(DR)].map((_,i)=>mk(i-DR+1)),m12=[...Array(12)].map((_,i)=>mk(i-11)),
  best=m12.map(m=>({m,v:tabM(m,'setor')})).sort((a,b)=>b.v-a.v).slice(0,5),
  dow=(new Date().getDay()+6)%7,wv=[...Array(7)].map((_,i)=>dstr(i-dow)).map(d=>db.tab.filter(t=>t.jenis=='setor'&&t.tgl==d).reduce((a,t)=>a+t.jml,0)),
  kl=kelasList().map(k=>({n:'Kelas '+k,v:db.siswa.filter(s=>s.kelas==k).reduce((a,s)=>a+Math.max(0,saldo(s.id)),0)})).sort((a,b)=>b.v-a.v).slice(0,4).map((x,i)=>({...x,c:['var(--c1)','var(--c2)','var(--c3)','var(--c4)'][i]})),
  top=[...db.siswa].sort((a,b)=>saldo(b.id)-saldo(a.id)).slice(0,5),
  tx=db.tab.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl)).slice(0,5),
  ag=db.agenda.filter(a=>a.tgl>=today()).sort((a,b)=>a.tgl.localeCompare(b.tgl))[0],inf=db.info.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl))[0];
  const kpi=(c,i,l,v,s)=>`<div class='card kpi'><div class='ki ${c}'>${ico(i)}</div><div class='kb'><div class='lab'>${l}</div><div class='big'>${v}</div><div class='lab'>${s}</div></div></div>`;
  const I={w:`<rect x='3' y='6' width='18' height='14' rx='3'/><path d='M3 10h18M16 15h2'/>`,t:`<path d='M3 17l6-6 4 4 7-8'/><path d='M15 7h5v5'/>`,k:`<rect x='2.5' y='6' width='19' height='12' rx='2'/><circle cx='12' cy='12' r='2.5'/>`,u:`<circle cx='9' cy='8' r='3.5'/><path d='M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6'/><path d='M16 4.5a3.5 3.5 0 010 7M18 14c2.2.8 3.5 3 3.5 6'/>`,r:`<path d='M6 3h12v18l-3-2-3 2-3-2-3 2z'/><path d='M9 8h6M9 12h6'/>`,c:`<rect x='5' y='4' width='14' height='17' rx='2'/><path d='M9 4h6v3H9zM9 14l2 2 4-4'/>`};
  const pnl=(t,s,b,x='')=>`<div class='card pnl ${x}'><div class='ch'><h3>${t}</h3><span class='lab'>${s}</span></div>${b}</div>`;
  const iuD=nom&&N?DC.donutL([{n:'Lunas',v:lunas,c:'var(--ok)'},{n:'Sebagian',v:pm.filter(x=>x>0&&x<nom).length,c:'var(--ac)'},{n:'Belum',v:pm.filter(x=>x==0).length,c:'var(--er)'}]):empty('Atur nominal iuran di menu Pengaturan.');
  return`<h2>Beranda</h2><p class='sub'>${esc(db.cfg.sekolah)} · Tahun ajaran ${esc(db.cfg.tahun)} · ${new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'})}</p>
<div class='bar'><button class='p' onclick='A.trx()'>Catat transaksi</button><button onclick='A.massal()'>Setoran massal</button><button onclick='A.siswa()'>Tambah siswa</button><button onclick='A.kas()'>Catat kas</button></div>
<div class='grid'>${kpi('',I.w,'Total tabungan',rp(tot),`<span class='${dTot>=0?'in':'out'}'>${dTot>=0?'+':'−'}${rp(Math.abs(dTot))}</span> bulan ini`)}${kpi('c',I.t,'Setoran bulan ini',rp(sm),pct==null?'Belum ada pembanding':`<span class='${pct>=0?'in':'out'}'>${pct>=0?'▲':'▼'} ${Math.abs(pct)}%</span> dari bulan lalu`)}${kpi('a',I.k,'Saldo kas kelas',rp(kasSaldo()),'Terpisah dari tabungan')}${kpi('b',I.u,'Jumlah siswa',N,belum.length+' belum menyetor bulan ini')}${kpi('a',I.r,'Iuran lunas',nom?lunas+'/'+N:'-',nom?'Bulan ini':'Nominal belum diatur')}${kpi('',I.c,'Hadir hari ini',hari.length?hari.filter(a=>a.st=='H').length+'/'+hari.length:'-','Absensi hari ini')}</div>
<div class='board'>
<div class='col3'>${pnl('Distribusi Tabungan','per kelas',DC.rings(kl))}${pnl('Kesehatan Kelas','bulan ini',DC.radar([{n:'Kehadiran',v:att},{n:'Iuran',v:iu},{n:'Menabung',v:mn},{n:'Target',v:tgt},{n:'Data lengkap',v:lg}]))}${pnl('Setoran Minggu Ini','Senin–Minggu',DC.mini(['Sen','Sel','Rab','Kam','Jum','Sab','Min'],wv))}</div>
<div class='col3 cc'>${pnl('Arus Tabungan',`<span class='seg'><button class='${DR==6?'on':''}' onclick='DR=6;go()'>6 bln</button><button class='${DR==12?'on':''}' onclick='DR=12;go()'>12 bln</button></span>`,
`<div class='kp2'><div><b class='bg'>${rp(sm)}</b>${pill(pct,'up')}<div class='lg2'><i style='background:var(--ok)'></i>Setoran bulan ini</div></div><div><b class='bg'>${rp(tp)}</b>${pill(pct2,'dn')}<div class='lg2'><i style='background:var(--er)'></i>Penarikan bulan ini</div></div></div>`
+DC.smooth(mR.map(mlab),[{n:'Setoran',c:'var(--ok)',v:mR.map(m=>tabM(m,'setor'))},{n:'Penarikan',c:'var(--er)',v:mR.map(m=>tabM(m,'tarik'))}])
+`<div class='top5'>${best.map((b,i)=>`<div><small>No.${i+1}</small><b>${b.v?'Rp '+CH.short(b.v):'-'}</b><span>${BLF[+b.m.slice(5)-1]}</span></div>`).join('')}</div>`
+`<div class='gr3'>${DC.gauge(att,'var(--pr)','Kehadiran',ab.length?ac('H')+' dari '+ab.length+' hadir':'Belum ada absensi')}${DC.gauge(iu,'var(--ac)','Iuran minggu ini',nom?lunas+' dari '+N+' siswa lunas':'Nominal belum diatur')}${DC.gauge(mn,'var(--inf)','Menabung',(N-belum.length)+' dari '+N+' siswa')}</div>`)}</div>
<div class='col3'>${pnl('Terbaru',inf?fd(inf.tgl):'',(inf?`<div class='lt'><small>Pengumuman terbaru</small><div class='cy'>${esc(inf.judul)}</div><div class='lab'>${esc(String(inf.isi||'').slice(0,90))}</div></div>`:'')+(ag?`<div class='lt'><small>Agenda berikutnya · ${fd(ag.tgl)}</small><div class='cy'>${esc(ag.judul)}</div><div class='lab'>${esc(ag.ket)}</div></div>`:'')||empty('Belum ada pengumuman atau agenda.'))}${pnl('Status Iuran','bulan ini',iuD)}${pnl('Peringkat Saldo','5 siswa teratas',DC.rank(top.map(s=>({n:s.nama,v:saldo(s.id)}))))}</div>
</div>
<div class='chg'>${pn('Belum menyetor bulan ini',belum.length+' siswa',belum.length?belum.slice(0,5).map(s=>`<div class='item'>${esc(s.nama)} <span class='tag'>${esc(s.kelas)}</span><button class='s' style='float:right' onclick='A.trx("${s.id}")'>Catat</button></div>`).join('')+(belum.length>5?`<div class='lab' style='padding-top:8px'>dan ${belum.length-5} siswa lainnya</div>`:''):empty('Semua siswa sudah menyetor bulan ini.'))}${pn('Transaksi terbaru','',tx.length?tx.map(t=>`<div class='item'>${esc(sis(t.sid).nama)}<span style='float:right'>${BK.tabAmt(t)}</span><div class='lab'>${fd(t.tgl)} · ${esc(t.cat||t.jenis)}</div></div>`).join(''):empty('Belum ada transaksi.'))}</div>`};

V.siswa=()=>{if(window.IDC&&IDC.on())return IDC.view();T=()=>{const q=Q.toLowerCase(),l=db.siswa.filter(s=>(s.nama+s.nis+s.kelas).toLowerCase().includes(q)&&(!KF||s.kelas==KF));
const sd=sid=>{const v=saldo(sid);return`<span class='sdl ${v>0?'pos':'nol'}'>${rp(v)}</span>`};
return tbl(['Nama','NIS','Kelas','Kontak wali','>Saldo',''],l.map(s=>{const sub=[s.jk,umur(s.tgl)].filter(Boolean).join(' · ');return`<tr><td><a class='pl sdn' href='#profil-${s.id}'>${av(s,40)}<span class='sdt2'><b>${esc(s.nama)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span></a></td><td><span class='nis'>${esc(s.nis)||'-'}</span></td><td>${s.kelas?`<span class='tag kls'>${esc(s.kelas)}</span>`:'-'}</td><td>${s.hp?esc(s.hp):`<span class='mu'>-</span>`}</td><td class="r">${sd(s.id)}</td><td class="r"><div class='sact'>${window.IDC?`<button class="s" onclick="IDC.one('${s.id}')">Kartu</button>`:''}<a class='btn s' href='#ubah-${s.id}'>Ubah</a><button class="s d" onclick="A.delSiswa('${s.id}')">Hapus</button></div></td></tr>`}),'Tidak ada siswa. Tambahkan siswa pertama.')+(l.length?`<div class='stn'>Menampilkan ${l.length} dari ${db.siswa.length} siswa</div>`:'')};
const n=db.siswa.length,lk=db.siswa.filter(s=>s.jk=='Laki-laki').length,pr=db.siswa.filter(s=>s.jk=='Perempuan').length,kl=kelasList().length;
const strip=window.ST?ST.sum([{l:'Total siswa',v:n,s:'terdaftar di sistem',c:'hero'},{l:'Laki-laki',v:lk},{l:'Perempuan',v:pr},{l:'Jumlah kelas',v:kl}]):'';
return`<h2>Data Siswa</h2><p class="sub">Daftar siswa menjadi dasar tabungan, voting, dan struktur kelas.</p>${window.IDC?IDC.tabs('daftar'):''}${strip}<div class="bar"><input type='search' placeholder="Cari nama, NIS, atau kelas" value="${esc(Q)}" aria-label='Cari siswa' oninput="Q=this.value;$('#tb').innerHTML=T()">${kfs()}<span class='sp'></span><button onclick='A.csvSiswa()'>Ekspor CSV</button><button onclick='A.naik()'>Naik kelas</button><button onclick="IMP.open('siswa')">Impor Excel</button><button class='p' onclick='A.siswa()'>Tambah siswa</button></div><div class="card stcard sdt" id="tb">${T()}</div>`};
V.tabungan=()=>{T=()=>{const q=Q.toLowerCase(),l=db.siswa.filter(s=>(s.nama+s.nis+s.kelas).toLowerCase().includes(q)&&(!KF||s.kelas==KF));
return tbl(['Nama','Kelas','>Total setor','>Total tarik','>Saldo',''],l.map(s=>{const a=db.tab.filter(t=>t.sid==s.id&&t.jenis=='setor').reduce((x,t)=>x+t.jml,0),b=db.tab.filter(t=>t.sid==s.id&&t.jenis=='tarik').reduce((x,t)=>x+t.jml,0);
return`<tr><td><a class='pl' href='#profil-${s.id}'>${av(s,30)}<b>${esc(s.nama)}</b></a></td><td>${esc(s.kelas)}</td><td class="r in">${rp(a)}</td><td class="r out">${rp(b)}</td><td class="r"><b>${rp(a-b)}</b></td><td class="r"><button class="s" onclick="A.trx('${s.id}')">Catat</button> <button class="s" onclick="A.buku('${s.id}')">Buku</button></td></tr>`}),'Belum ada siswa. Tambahkan di menu Data Siswa.')};
const tx=db.tab.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl)).slice(0,15);
return`<h2>Tabungan Siswa</h2><p class="sub">Catat setoran dan penarikan, lalu cetak buku tabungan tiap siswa.</p><div class="bar"><input placeholder="Cari siswa" value="${esc(Q)}" oninput="Q=this.value;$('#tb').innerHTML=T()">${kfs()}<span class="sp"></span><button onclick="A.csvTrx()">Ekspor transaksi</button><button onclick="IMP.open('tab')">Impor Excel</button><button onclick="A.massal()">Setoran massal</button><button class="p" onclick="A.trx()">Catat transaksi</button></div>
<div class="card" id="tb">${T()}</div><h3 style="margin:22px 0 8px">Transaksi terakhir</h3><div class="card">${tbl(['Tanggal','Siswa','Jenis','>Jumlah','Catatan',''],tx.map(t=>`<tr><td>${fd(t.tgl)}</td><td>${esc(sis(t.sid).nama)}</td><td>${t.jenis=='setor'?'Setor':'Tarik'}</td><td class="r ${t.jenis=='setor'?'in':'out'}">${rp(t.jml)}</td><td>${esc(t.cat)}</td><td class="r"><button class="s" onclick="A.struk('${t.id}')">Struk</button> <button class="s d" onclick="A.delTrx('${t.id}')">Batalkan</button></td></tr>`),'Belum ada transaksi.')}</div>`};
V.kas=()=>{const l=db.kas.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl)),i=l.filter(k=>k.jenis=='masuk').reduce((a,k)=>a+k.jml,0),o=l.filter(k=>k.jenis=='keluar').reduce((a,k)=>a+k.jml,0);
return`<h2>Kas Kelas</h2><p class="sub">Iuran mingguan masuk otomatis dari menu Iuran; pengeluaran dan pemasukan lain dicatat manual. Terpisah dari tabungan siswa.</p><div class="grid"><div class="card"><div class="lab">Pemasukan</div><div class="big in">${rp(i)}</div></div><div class="card"><div class="lab">Pengeluaran</div><div class="big out">${rp(o)}</div></div><div class="card"><div class="lab">Saldo kas</div><div class="big">${rp(i-o)}</div></div></div>
${(()=>{const ks=[-5,-4,-3,-2,-1,0].map(mk),f=(m,j)=>db.kas.filter(k=>k.jenis==j&&k.tgl.slice(0,7)==m).reduce((a,k)=>a+k.jml,0);return`<div class="card" style="margin-bottom:14px"><div class="ch"><h3>Kas masuk dan keluar</h3><span class="lab">6 bulan terakhir</span></div>${CH.bars(ks.map(mlab),[{n:"Masuk",c:"var(--ok)",v:ks.map(m=>f(m,"masuk"))},{n:"Keluar",c:"var(--er)",v:ks.map(m=>f(m,"keluar"))}])}</div>`})()}<div class="bar"><span class="sp"></span><button onclick="IMP.open('kas')">Impor Excel</button><button class="p" onclick="A.kas()">Catat kas</button></div><div class="card">${tbl(['Tanggal','Jenis','Keterangan','>Jumlah',''],l.map(k=>`<tr><td>${fd(k.tgl)}</td><td>${k.jenis=='masuk'?'Masuk':'Keluar'}</td><td>${esc(k.ket)}</td><td class="r ${k.jenis=='masuk'?'in':'out'}">${rp(k.jml)}</td><td class="r">${isAutoKas(k)?'<span class="tag">Otomatis dari Iuran</span>':`<button class="s d" onclick="A.delK('kas','${k.id}')">Hapus</button>`}</td></tr>`),'Belum ada catatan kas.')}</div>`};
V.agenda=()=>{const l=db.agenda.slice().sort((a,b)=>a.tgl.localeCompare(b.tgl));return`<h2>Agenda</h2><p class="sub">Jadwal kegiatan kelas dan sekolah.</p><div class="bar"><span class="sp"></span><button onclick="IMP.open('agenda')">Impor Excel</button><button class="p" onclick="A.agenda()">Tambah agenda</button></div><div class="card">${l.length?l.map(a=>`<div class="item"><b>${esc(a.judul)}</b> ${a.tgl<today()?'<span class="tag">Selesai</span>':''}<span style="float:right"><button class="s" onclick="A.agenda('${a.id}')">Ubah</button> <button class="s d" onclick="A.delK('agenda','${a.id}')">Hapus</button></span><div class="lab">${fd(a.tgl)} · ${esc(a.ket)}</div></div>`).join(''):empty('Belum ada agenda.')}</div>`};
V.pengumuman=()=>{const l=db.info.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl));return`<h2>Pengumuman</h2><p class="sub">Informasi untuk siswa dan wali murid.</p><div class="bar"><span class="sp"></span><button onclick="IMP.open('info')">Impor Excel</button><button class="p" onclick="A.info()">Buat pengumuman</button></div><div class="card">${l.length?l.map(a=>`<div class="item"><b>${esc(a.judul)}</b><span style="float:right"><button class="s" onclick="A.info('${a.id}')">Ubah</button> <button class="s d" onclick="A.delK('info','${a.id}')">Hapus</button></span><div class="lab">${fd(a.tgl)}</div><div>${esc(a.isi)}</div></div>`).join(''):empty('Belum ada pengumuman.')}</div>`};
V.voting=()=>{const wr=Data.canWrite();
return`<h2>Voting</h2><p class="sub">Pemilihan ketua kelas atau keputusan bersama. Setiap siswa memberi suara dari akunnya sendiri: satu akun satu suara, rahasia, dan tidak dapat diubah.</p><div class="bar"><span class="sp"></span><button class="p" onclick="A.vote()">Buat pemilihan</button></div>${db.vote.length?db.vote.map(v=>{
const c={};Object.values(v.suara).forEach(k=>c[k]=(c[k]||0)+1);const n=Object.keys(v.suara).length,mx=Math.max(0,...v.kand.map(k=>c[k]||0));
const kel=new Set(v.kand.map(k=>(db.siswa.find(s=>s.id==k)||{}).kelas).filter(Boolean)),el=db.siswa.filter(s=>kel.has(s.kelas)),belum=el.filter(s=>!v.suara[s.id]);
return`<div class="card" style="margin-bottom:12px"><h3>${esc(v.judul)} <span class="tag">${v.open?'Dibuka':'Ditutup'}</span></h3>${v.kand.map(k=>`<div>${esc(sis(k).nama)}${!v.open&&mx&&(c[k]||0)==mx?' <span class="tag">Unggul</span>':''}<span style="float:right"><b>${c[k]||0}</b> suara${n?' · '+Math.round((c[k]||0)/n*100)+'%':''}</span></div><div class="meter"><i style="width:${n?(c[k]||0)/n*100:0}%"></i></div>`).join('')}<div class="lab">${n} dari ${el.length} siswa berhak (kelas ${esc([...kel].join(', ')||'-')}) sudah memilih${v.open?'. Siswa memberi suara sendiri lewat akun masing-masing; akun siswa dibuat dan ditautkan di menu Pengguna.':'.'}</div>${belum.length&&v.open?`<details class="lab" style="margin-top:8px"><summary>${belum.length} siswa belum memilih</summary><div style="margin-top:4px">${belum.map(s=>esc(s.nama)).join(', ')}</div></details>`:''}<div class="acts" style="justify-content:flex-start;margin-top:10px">${v.open?`<button class="s" onclick="A.tutup('${v.id}')">Tutup pemilihan</button>`:''}<button class="s d" onclick="A.delK('vote','${v.id}')">Hapus</button></div></div>`}).join(''):`<div class="card">${empty('Belum ada pemilihan.')}</div>`}`};
V.struktur=()=>`<h2>Struktur Kelas</h2><p class="sub">Pengurus kelas seperti ketua, sekretaris, bendahara, dan seksi.</p><div class="bar"><span class="sp"></span><button class="p" onclick="A.jab()">Tambah jabatan</button></div><div class="card">${tbl(['Jabatan','Nama',''],db.struktur.map(j=>`<tr><td><b>${esc(j.jab)}</b></td><td>${esc(sis(j.sid).nama)}</td><td class="r"><button class="s" onclick="A.jab('${j.id}')">Ubah</button> <button class="s d" onclick="A.delK('struktur','${j.id}')">Hapus</button></td></tr>`),'Belum ada pengurus. Tambahkan ketua kelas terlebih dahulu.')}</div>`;
V.laporan=()=>{const l=db.siswa.filter(s=>!RK||s.kelas==RK);let a=0,b=0,c=0;
const rows=l.map(s=>{const x=db.tab.filter(t=>t.sid==s.id&&t.jenis=='setor'&&(!RB||t.tgl.slice(0,7)==RB)).reduce((p,t)=>p+t.jml,0),y=db.tab.filter(t=>t.sid==s.id&&t.jenis=='tarik'&&(!RB||t.tgl.slice(0,7)==RB)).reduce((p,t)=>p+t.jml,0);a+=x;b+=y;c+=saldo(s.id);return`<tr><td>${esc(s.nama)}</td><td>${esc(s.nis)}</td><td>${esc(s.kelas)}</td><td class="r">${rp(x)}</td><td class="r">${rp(y)}</td><td class="r"><b>${rp(saldo(s.id))}</b></td></tr>`});
return`<h2>Laporan</h2><p class="sub">Rekap tabungan ${RK?'kelas '+esc(RK):'seluruh kelas'}. Cetak atau simpan sebagai PDF lewat dialog cetak.</p><div class="bar"><input type='month' value='${RB}' onchange='RB=this.value;go()' title='Periode laporan'><select onchange="RK=this.value;go()"><option value="">Semua kelas</option>${kelasList().map(k=>`<option ${k==RK?'selected':''}>${esc(k)}</option>`).join('')}</select><span class="sp"></span><button onclick="A.csvLap()">Ekspor CSV</button><button class="p" onclick="print()">Cetak laporan</button></div>
<div class="card" style="margin-bottom:14px"><div class="ch"><h3>Saldo per kelas</h3><span class="lab">Saldo saat ini</span></div>${CH.hbar(kelasList().filter(k=>!RK||k==RK).map(k=>({n:"Kelas "+k,v:db.siswa.filter(x=>x.kelas==k).reduce((a,x)=>a+saldo(x.id),0)})))}</div><div class="card"><h3>${esc(db.cfg.sekolah)} · Rekap tabungan ${RB?'periode '+RB:'keseluruhan'} · ${fd(today())}</h3>${tbl(['Nama','NIS','Kelas','>Setor'+(RB?' periode':''),'>Tarik'+(RB?' periode':''),'>Saldo akhir'],rows.concat(rows.length?[`<tr><td colspan="3"><b>Total</b></td><td class="r"><b>${rp(a)}</b></td><td class="r"><b>${rp(b)}</b></td><td class="r"><b>${rp(c)}</b></td></tr>`]:[]),'Tidak ada data untuk dilaporkan.')}<p class='lab'>Saldo kas kelas: ${rp(kasSaldo())}</p><div style='display:flex;justify-content:space-around;margin-top:36px;text-align:center'><div>Wali kelas<br><br><br><br><b>${esc(db.cfg.walikelas)}</b></div><div>Bendahara<br><br><br><br><b>${(()=>{const j=db.struktur.find(j=>/bendahara/i.test(j.jab));return j?esc(sis(j.sid).nama):'(..............)'})()}</b></div></div></div>`};
/* ---------- actions ---------- */
const A={
siswa(id){const v=db.siswa.find(s=>s.id==id)||{};form(id?'Ubah siswa':'Tambah siswa',[{k:'nama',l:'Nama lengkap',r:1},{k:'nis',l:'NIS',r:1},{k:'kelas',l:'Kelas',r:1},{k:'hp',l:'Kontak wali (opsional)',t:'tel'},{k:'bio',l:'Bio singkat (opsional)',t:'area'}],v,o=>{if(db.siswa.some(s=>s.nis==o.nis&&s.id!=id))return'NIS sudah dipakai siswa lain.';if(id)Object.assign(v,o);else db.siswa.push({id:uid(),...o})})},
delSiswa(id){const n=db.tab.filter(t=>t.sid==id).length,sd=saldo(id);if(sd>0&&Data.bankOk!==false)return toast('Rekening masih bersaldo '+rp(sd)+'. Tarik seluruh saldo lebih dulu (Tabungan > Mutasi > Tutup rekening).');ask(`Hapus siswa ini beserta ${n} transaksi tabungannya dan seluruh catatan iurannya? Tindakan ini permanen dan tidak bisa dibatalkan.`,()=>{const x=db.siswa.find(s=>s.id==id);if(x){Data.drop(x.foto);Data.drop(x.cover)}db.siswa=db.siswa.filter(s=>s.id!=id);db.tab=db.tab.filter(t=>t.sid!=id);db.iuran=db.iuran.filter(i=>i.sid!=id);db.absensi=db.absensi.filter(a=>a.sid!=id);db.struktur=db.struktur.filter(j=>j.sid!=id)})},
trx(sid){if(!db.siswa.length)return toast('Tambahkan siswa terlebih dahulu');form('Catat transaksi tabungan',[{k:'sid',l:'Siswa',t:'select',o:sopt(),d:sid},{k:'jenis',l:'Jenis',t:'select',o:[['setor','Setoran'],['tarik','Penarikan']]},{k:'jml',l:'Jumlah (Rp)',t:'number',r:1},{k:'tgl',l:'Tanggal',t:'date',d:today(),r:1},{k:'cat',l:'Catatan (opsional)'}],{},o=>{o.jml=+o.jml;if(!(o.jml>0))return'Jumlah harus lebih dari 0.';if(o.jenis=='tarik'&&o.jml>saldo(o.sid))return'Saldo tidak cukup. Saldo saat ini '+rp(saldo(o.sid))+'.';db.tab.push({id:uid(),...o});LG=1;logA((o.jenis=='setor'?'Setoran ':'Penarikan ')+rp(o.jml)+' · '+sis(o.sid).nama);toast('Transaksi tercatat')},'Simpan transaksi')},
buku(id){const s=sis(id);let r=0;const l=db.tab.filter(t=>t.sid==id).sort((a,b)=>a.tgl.localeCompare(b.tgl));const d=$('#dlg');
d.innerHTML=`<h3>Buku tabungan · ${esc(s.nama)}</h3><p class="lab">${Brand.tile(22,'inl')}${esc(db.cfg.sekolah)} · NIS ${esc(s.nis)} · Kelas ${esc(s.kelas)}</p>${tbl(['Tanggal','>Setor','>Tarik','>Saldo'],l.map(t=>{r+=(t.jenis=='setor'?1:-1)*t.jml;return`<tr><td>${fd(t.tgl)}</td><td class="r in">${t.jenis=='setor'?rp(t.jml):''}</td><td class="r out">${t.jenis=='tarik'?rp(t.jml):''}</td><td class="r">${rp(r)}</td></tr>`}),'Belum ada transaksi.')}<p><b>Saldo akhir: ${rp(r)}</b></p><div class="acts"><button id="x">Tutup</button><button class="p" id="pr">Cetak buku</button></div>`;d.showModal();
$('#x').onclick=()=>d.close();$('#pr').onclick=()=>{document.body.classList.add('pd');print();document.body.classList.remove('pd')}},
massal(){if(!db.siswa.length)return toast('Tambahkan siswa terlebih dahulu');const d=$('#dlg'),ks=kelasList();let k=ks[0],tg=today();
const draw=()=>{d.innerHTML=`<h3>Setoran massal</h3><label>Kelas<select id='mk'>${ks.map(x=>`<option ${x==k?'selected':''}>${esc(x)}</option>`).join('')}</select></label><label>Tanggal<input id='md' type='date' value='${tg}'></label><label>Isi semua dengan (Rp)<input id='ma' type='number' min='1' placeholder='mis. 5000'></label>${db.siswa.filter(s=>s.kelas==k).map(s=>`<label>${esc(s.nama)}<input class='mi' data-s='${s.id}' type='number' min='0' placeholder='0'></label>`).join('')}<div id='err' style='color:var(--er);margin-bottom:6px'></div><div class='acts'><button id='x'>Batal</button><button class='p' id='ok'>Simpan setoran</button></div>`;
$('#mk').onchange=e=>{k=e.target.value;draw()};$('#md').onchange=e=>tg=e.target.value;$('#ma').oninput=e=>d.querySelectorAll('.mi').forEach(i=>i.value=e.target.value);$('#x').onclick=()=>d.close();
$('#ok').onclick=()=>{let n=0,s=0;d.querySelectorAll('.mi').forEach(i=>{const v=+i.value;if(v>0){db.tab.push({id:uid(),sid:i.dataset.s,tgl:tg,jenis:'setor',jml:v,cat:'Setoran massal'});n++;s+=v}});if(!n){$('#err').textContent='Isi minimal satu nominal.';return}logA('Setoran massal kelas '+k+': '+n+' siswa, '+rp(s));save();d.close();go();toast(n+' setoran tercatat')}};draw();d.showModal()},
naik(){if(!db.siswa.length)return toast('Belum ada siswa');form('Naik kelas / pindah kelas',[{k:'a',l:'Kelas asal',t:'select',o:kelasList().map(k=>[k,k])},{k:'b',l:'Kelas baru',r:1}],{},o=>{const n=db.siswa.filter(s=>s.kelas==o.a);n.forEach(s=>s.kelas=o.b);LG=1;logA('Kelas '+o.a+' dipindahkan ke '+o.b+' ('+n.length+' siswa)');toast(n.length+' siswa dipindahkan')},'Pindahkan')},
tab(k){PT=k;go()},
foto(id,k){const i=document.createElement('input');i.type='file';i.accept='image/*';i.onchange=()=>{const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const sq=k=='foto',W=sq?320:1000,H=sq?320:320,c=document.createElement('canvas');c.width=W;c.height=H;const q=Math.max(W/im.width,H/im.height),w=im.width*q,h=im.height*q;c.getContext('2d').drawImage(im,(W-w)/2,(H-h)/2,w,h);const s=db.siswa.find(x=>x.id==id);c.toBlob(async b=>{try{const old=s[k];s[k]=await Data.upload(id,k,b);Data.drop(old);logA((sq?'Foto profil':'Sampul')+' diperbarui: '+s.nama);save();go();toast('Foto diperbarui')}catch(e){toast('Gagal mengunggah foto: '+e.message)}},'image/jpeg',.82)};im.onerror=()=>toast('File bukan gambar yang valid');im.src=r.result};r.readAsDataURL(f)};i.click()},
rd(){UF.forEach(g=>g[1].forEach(f=>{const e=$('#f_'+f.k);if(e)D[f.k]=e.value}));const u=$('#usia');if(u)u.textContent=umur(D.tgl)||'—'},
simpan(){const s=db.siswa.find(x=>x.id==PID);A.rd();const e=!D.nama.trim()?'Nama lengkap wajib diisi.':!D.nis.trim()?'NIS wajib diisi.':!D.kelas.trim()?'Kelas wajib diisi.':db.siswa.some(x=>x.nis==D.nis.trim()&&x.id!=PID)?'NIS sudah dipakai siswa lain.':D.tgl&&D.tgl>today()?'Tanggal lahir tidak boleh di masa depan.':'';if(e)return toast(e);UF.forEach(g=>g[1].forEach(f=>s[f.k]=String(D[f.k]).trim()));logA('Profil diperbarui: '+s.nama);D={};save();toast('Profil disimpan');location.hash='profil-'+PID},
batal(){D={};location.hash='profil-'+PID},
delTrx(id){ask('Batalkan transaksi ini? Saldo siswa akan dihitung ulang.',()=>db.tab=db.tab.filter(t=>t.id!=id))},
kas(){form('Catat kas kelas',[{k:'jenis',l:'Jenis',t:'select',o:[['masuk','Pemasukan'],['keluar','Pengeluaran']]},{k:'jml',l:'Jumlah (Rp)',t:'number',r:1},{k:'tgl',l:'Tanggal',t:'date',d:today(),r:1},{k:'ket',l:'Keterangan',r:1}],{},o=>{o.jml=+o.jml;if(!(o.jml>0))return'Jumlah harus lebih dari 0.';db.kas.push({id:uid(),...o})})},
agenda(id){const v=db.agenda.find(a=>a.id==id)||{};form(id?'Ubah agenda':'Tambah agenda',[{k:'judul',l:'Nama kegiatan',r:1},{k:'tgl',l:'Tanggal',t:'date',d:today(),r:1},{k:'ket',l:'Tempat dan waktu',t:'area'}],v,o=>{id?Object.assign(v,o):db.agenda.push({id:uid(),...o})})},
info(id){const v=db.info.find(a=>a.id==id)||{};form(id?'Ubah pengumuman':'Buat pengumuman',[{k:'judul',l:'Judul',r:1},{k:'isi',l:'Isi pengumuman',t:'area',r:1}],v,o=>{id?Object.assign(v,o):db.info.push({id:uid(),tgl:today(),...o})})},
vote(){if(db.siswa.length<2)return toast('Minimal 2 siswa untuk membuat pemilihan');form('Buat pemilihan',[{k:'judul',l:'Judul pemilihan (mis. Ketua kelas 5A)',r:1},{k:'kand',l:'Kandidat',t:'multi',o:sopt()}],{},o=>{if(o.kand.length<2)return'Pilih minimal 2 kandidat.';db.vote.push({id:uid(),judul:o.judul,kand:o.kand,open:true,suara:{}})})},
tutup(id){ask('Tutup pemilihan ini? Suara tidak bisa ditambah lagi.',()=>db.vote.find(x=>x.id==id).open=false)},
jab(id){const v=db.struktur.find(j=>j.id==id)||{};if(!db.siswa.length)return toast('Tambahkan siswa terlebih dahulu');form(id?'Ubah jabatan':'Tambah jabatan',[{k:'jab',l:'Jabatan',r:1},{k:'sid',l:'Siswa',t:'select',o:sopt()}],v,o=>{id?Object.assign(v,o):db.struktur.push({id:uid(),...o})})},
delK(k,id){if(k=='kas'&&String(id).startsWith('iu_'))return toast('Dibuat otomatis dari Iuran. Batalkan pembayarannya di menu Iuran.');ask('Hapus data ini?',()=>db[k]=db[k].filter(x=>x.id!=id))}
/* cfg, cadangan, pemulihan, reset, dan logo: js/pengaturan.js */
};
/* ---------- router ---------- */
V.aktivitas=()=>`<h2>Riwayat Aktivitas</h2><p class='sub'>Jejak perubahan data agar pengelolaan tetap transparan.</p><div class='card'>${(db.log||[]).length?db.log.map(l=>`<div class='item'>${esc(l.m)}<div class='lab'>${new Date(l.t).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div></div>`).join(''):empty('Belum ada aktivitas tercatat.')}</div>`;
V.profil=()=>{const s=db.siswa.find(x=>x.id==PID);if(!s)return`<h2>Siswa tidak ditemukan</h2><p class='sub'>Profil ini sudah dihapus. <a class='pl' href='#siswa'><b>Kembali ke Data Siswa</b></a></p>`;
const tx=db.tab.filter(t=>t.sid==s.id).sort((a,b)=>b.tgl.localeCompare(a.tgl)),st=tx.filter(t=>t.jenis=='setor'),ts=st.reduce((a,t)=>a+t.jml,0),tt=tx.filter(t=>t.jenis=='tarik').reduce((a,t)=>a+t.jml,0),jb=db.struktur.filter(j=>j.sid==s.id).map(j=>j.jab),tm=db.siswa.filter(x=>x.kelas==s.kelas&&x.id!=s.id),
ab=db.absensi.filter(x=>x.sid==s.id),ac=k=>ab.filter(x=>x.st==k).length,hp=ab.length?Math.round(ac('H')/ab.length*100):null,sal=saldo(s.id),
cv=Data.url(s.cover)?`url(${Data.url(s.cover)}),linear-gradient(135deg,${avc(s.nama)},color-mix(in srgb,${avc(s.nama)} 42%,var(--bg)))`:`linear-gradient(135deg,${avc(s.nama)},color-mix(in srgb,${avc(s.nama)} 42%,var(--bg)))`,
kv=(a,b)=>`<div class='kv'><span class='mu'>${a}</span><b>${b}</b></div>`,
kx=(a,b)=>{const v=String(b??'').trim();return`<div class='kv'><span class='mu'>${a}</span>${v?`<b>${esc(v)}</b>`:`<b class='mu pfn'>-</b>`}</div>`},
sec=(t,rows)=>`<div class='card pfs'><h3>${t}</h3>${rows}</div>`,
chips=[s.kelas?'Kelas '+esc(s.kelas):'',s.nis?'NIS '+esc(s.nis):'',s.tgl?esc(umur(s.tgl)):''].filter(Boolean).map(x=>`<span class='pfc'>${x}</span>`).join('')+jb.map(x=>`<span class='pfc jb'>${esc(x)}</span>`).join(''),
kpi=(l,v,sub,c)=>`<div class='${c||''}'><span>${l}</span><b>${v}</b>${sub?`<small>${sub}</small>`:''}</div>`,
kp=`<div class='pfk'>${kpi('Saldo tabungan',rp(sal),+s.target>0?'Target '+rp(s.target)+' · '+Math.max(0,Math.min(100,Math.round(sal/s.target*100)))+'%':'Saldo saat ini','hero')}${kpi('Total setoran',rp(ts),st.length+' kali menabung','in')}${kpi('Total penarikan',rp(tt),tx.length-st.length+' kali menarik','out')}${kpi('Kehadiran',hp==null?'-':hp+'%',ab.length?ac('H')+' dari '+ab.length+' hari hadir':'Belum ada absensi')}</div>`,
intro=`<div class='card pfs'><h3>Tentang ${esc(s.nama.split(' ')[0])}</h3>${s.bio?`<p class='pfbio'>${esc(s.bio)}</p>`:''}${s.tgl?kv('Lahir',esc([s.tl,fd(s.tgl)].filter(Boolean).join(', '))):''}${s.alamat?kv('Alamat',esc(s.alamat)):''}${s.hp?kv('Kontak wali',esc(s.hp)):''}${s.hobi?kv('Hobi',esc(s.hobi)):''}${s.cita?kv('Cita-cita',esc(s.cita)):''}${!s.bio&&!s.tgl&&!s.alamat&&!s.hp&&!s.hobi&&!s.cita?`<p class='lab' style='margin:0'>Belum ada informasi tambahan. Lengkapi lewat tombol Ubah profil.</p>`:''}${+s.target>0?`<div class='lab' style='margin-top:10px'>Target ${rp(s.target)} · ${Math.max(0,Math.min(100,Math.round(sal/s.target*100)))}%</div><div class='meter'><i style='width:${Math.max(0,Math.min(100,sal/s.target*100))}%'></i></div>`:''}</div>`,
ic=t=>t=='setor'?ico(`<path d='M12 4v13M6.5 11.5L12 17l5.5-5.5'/><path d='M5 20h14'/>`):ico(`<path d='M12 20V7M6.5 12.5L12 7l5.5 5.5'/><path d='M5 4h14'/>`),
feed=`<div class='card post pfcomp'>${av(s,40)}<button onclick=A.trx('${s.id}')>Catat setoran atau penarikan untuk ${esc(s.nama.split(' ')[0])}…</button></div>`+(tx.length?`<div class='card pfs'><div class='sth2' style='margin:0 0 4px'><h3>Aktivitas tabungan</h3><span class='lab'>${tx.length} transaksi</span></div><div class='pfa'>${tx.map(t=>`<div class='pfi'><i class='pfb ${t.jenis}'>${ic(t.jenis)}</i><div class='pft'><b>${t.jenis=='setor'?'Setoran':'Penarikan'}</b><span class='lab'>${fd(t.tgl)}${t.cat?' · '+esc(t.cat):''}</span></div><div class='pfm'>${BK.tabAmt(t)}</div></div>`).join('')}</div></div>`:`<div class='card'>${empty('Belum ada aktivitas tabungan.')}</div>`),
pc=(l,n,c)=>`<div class='pfr'><div class='pfrh'><span>${l}</span><b>${n}</b></div><div class='meter'><i style='width:${ab.length?Math.round(n/ab.length*100):0}%;${c?'background:'+c:''}'></i></div></div>`,
body=PT=='tentang'?`<div class='pfg'>`
+sec('Identitas',kx('Nama lengkap',s.nama)+kx('NISN',s.nisn)+kx('NIS',s.nis)+kx('Kelas',s.kelas)+kx('Jenis kelamin',s.jk)+kx('Tempat, tanggal lahir',[s.tl,s.tgl?fd(s.tgl):''].filter(Boolean).join(', '))+kx('Usia',umur(s.tgl))+kx('Agama',s.agama)+kx('Golongan darah',s.gol)+kx('Tanggal masuk',s.masuk?fd(s.masuk):'')+kx('Jabatan',jb.join(', ')))
+sec('Kontak dan keluarga',kx('Alamat',s.alamat)+kx('Kontak wali',s.hp)+kx('Nama ayah',s.ayah)+kx('Nama ibu',s.ibu)+kx('Nama wali',s.wali)+kx('Pekerjaan orang tua / wali',s.pkj))
+sec('Minat dan kesehatan',kx('Hobi',s.hobi)+kx('Cita-cita',s.cita)+kx('Catatan kesehatan',s.kes))
+sec('Kehadiran',ab.length?pc('Hadir',ac('H'),'var(--ok)')+pc('Sakit',ac('S'),'var(--inf)')+pc('Izin',ac('I'),'var(--ac)')+pc('Alpa',ac('A'),'var(--er)')+`<div class='lab' style='margin-top:6px'>Dihitung dari ${ab.length} hari yang tercatat.</div>`:empty('Belum ada absensi.'))
+sec('Ringkasan tabungan',kv('Total setoran',rp(ts))+kv('Total penarikan',rp(tt))+kv('Saldo',`<span class='in'>${rp(ts-tt)}</span>`)+kv('Jumlah setoran',st.length+' kali')+kv('Rata-rata setoran',rp(st.length?ts/st.length:0)))
+`</div>`:PT=='teman'?`<div class='card pfs' style='margin-top:14px'><div class='sth2' style='margin:0 0 12px'><h3>Teman sekelas</h3><span class='lab'>${tm.length} siswa · Kelas ${esc(s.kelas)}</span></div>${tm.length?`<div class='fr'>${tm.map(x=>`<a href='#profil-${x.id}'>${av(x,64)}<div style='margin-top:6px'><b>${esc(x.nama)}</b></div></a>`).join('')}</div>`:empty('Belum ada teman sekelas.')}</div>`:`<div class='pg'><div>${intro}${trendCard(s)}</div><div>${feed}</div></div>`;
const tb=[['linimasa','Linimasa',tx.length],['tentang','Tentang',0],['teman','Teman sekelas',tm.length]].filter(t=>t[0]!='teman'||!portal());
return`<div class='card pf'><div class='cov' style='background-image:${cv}'><button class='s' onclick=A.foto('${s.id}','cover')>Ubah sampul</button></div><div class='hd'><div style='position:relative'>${av(s,128)}<button class='cam' title='Ganti foto' onclick=A.foto('${s.id}','foto')>${ico(`<path d='M4 8h3l2-3h6l2 3h3v11H4z'/><circle cx='12' cy='13' r='3.5'/>`)}</button></div><div class='who'><h2>${esc(s.nama)}</h2><div class='pfcs'>${chips}</div>${Data.role=='admin'?`<div id='akun-s' class='akn'></div>`:''}</div><div class='bar' style='margin:0'><button class='p' onclick=A.trx('${s.id}')>Catat transaksi</button><button onclick=A.buku('${s.id}')>Buku tabungan</button>${window.IDC&&!portal()?`<button onclick=IDC.one('${s.id}')>Kartu ID</button>`:''}${Data.canWrite()&&waNum(s.hp)?`<a class='btn' target='_blank' rel='noopener' href='${waUrl(s.hp,'Yth. Orang tua/wali dari '+s.nama+', ')}'>WhatsApp wali</a>`:''}<a class='btn' href='#ubah-${s.id}'>Ubah profil</a></div></div>${kp}<div class='tabs'>${tb.map(t=>`<button class='${PT==t[0]?'on':''}' onclick=A.tab('${t[0]}')>${t[1]}${t[2]?`<span class='pfct'>${t[2]}</span>`:''}</button>`).join('')}</div></div>${body}`};
V.ubah=()=>{const s=db.siswa.find(x=>x.id==PID);if(!s)return`<h2>Siswa tidak ditemukan</h2><p class='sub'><a class='pl' href='#siswa'><b>Kembali ke Data Siswa</b></a></p>`;
if(D.id!=PID){D={id:PID};UF.forEach(g=>g[1].forEach(f=>D[f.k]=s[f.k]||''))}
const hu=hue(s.nama),cv=Data.url(s.cover)?`url(${Data.url(s.cover)}),linear-gradient(135deg,${avc(s.nama)},color-mix(in srgb,${avc(s.nama)} 42%,var(--bg)))`:`linear-gradient(135deg,${avc(s.nama)},color-mix(in srgb,${avc(s.nama)} 42%,var(--bg)))`;
return`<div class='card pf'><div class='cov' style='background-image:${cv}'><button class='s' onclick=A.foto('${s.id}','cover')>Ubah sampul</button></div><div class='hd'><div style='position:relative'>${av(s,128)}<button class='cam' title='Ganti foto' onclick=A.foto('${s.id}','foto')>${ico(`<path d='M4 8h3l2-3h6l2 3h3v11H4z'/><circle cx='12' cy='13' r='3.5'/>`)}</button></div><div class='who'><h2>Ubah profil</h2><div class='lab'>${esc(s.nama)} · Kelas ${esc(s.kelas)}. Foto dan sampul tersimpan otomatis.</div></div></div></div>
<div oninput='A.rd()' onchange='A.rd()'>${UF.map(g=>`<div class='card' style='margin-top:14px'><h3>${g[0]}</h3><div class='fg'>${g[1].map(f=>fld(f,D)).join('')}</div>${g[0]=='Data pribadi'?`<div class='kv'><span class='mu'>Usia (dihitung otomatis dari tanggal lahir)</span><b id='usia'>${umur(D.tgl)||'—'}</b></div>`:''}</div>`).join('')}</div>
<div class='sav'><button onclick=A.batal()>Batal</button><button class='p' onclick=A.simpan()>Simpan perubahan</button></div>`};
const ico=p=>`<svg viewBox='0 0 24 24' width='18' height='18' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${p}</svg>`;
const NAV=[['portal','Portal Anak','Utama',`<circle cx='12' cy='8' r='3.5'/><path d='M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5'/><path d='M12 12.5v3'/>`],['dashboard','Beranda','Utama',`<path d='M3 11l9-8 9 8'/><path d='M5 10v10h14V10'/>`],['tabungan','Tabungan','Keuangan',`<rect x='3' y='6' width='18' height='14' rx='3'/><path d='M3 10h18M16 15h2'/>`],['kas','Kas Kelas','Keuangan',`<rect x='2.5' y='6' width='19' height='12' rx='2'/><circle cx='12' cy='12' r='2.5'/>`],['iuran','Iuran','Keuangan',`<path d='M6 3h12v18l-3-2-3 2-3-2-3 2z'/><path d='M9 8h6M9 12h6'/>`],['pengingat','Pengingat','Keuangan',`<path d='M4 5h16v11H9l-5 4z'/><path d='M8 9h8M8 12h5'/>`],['laporan','Laporan','Keuangan',`<path d='M6 3h8l4 4v14H6z'/><path d='M9 12h6M9 16h6'/>`],['siswa','Data Siswa','Kelas',`<circle cx='9' cy='8' r='3.5'/><path d='M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6'/><path d='M16 4.5a3.5 3.5 0 010 7M18 14c2.2.8 3.5 3 3.5 6'/>`],['struktur','Struktur Kelas','Kelas',`<rect x='9' y='3' width='6' height='5' rx='1'/><rect x='3' y='16' width='6' height='5' rx='1'/><rect x='15' y='16' width='6' height='5' rx='1'/><path d='M12 8v4M6 16v-4h12v4'/>`],['absensi','Absensi','Kelas',`<rect x='5' y='4' width='14' height='17' rx='2'/><path d='M9 4h6v3H9zM9 14l2 2 4-4'/>`],['agenda','Agenda','Kelas',`<rect x='3.5' y='5' width='17' height='15.5' rx='2.5'/><path d='M8 3v4M16 3v4M3.5 10h17'/>`],['pengumuman','Pengumuman','Kelas',`<path d='M6 17v-6a6 6 0 1112 0v6l1.5 2h-15z'/><path d='M10 21h4'/>`],['voting','Voting','Kelas',`<rect x='4' y='4' width='16' height='16' rx='3'/><path d='M8.5 12.5l2.5 2.5 4.5-5.5'/>`],['aktivitas','Aktivitas','Sistem',`<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>`],['pengguna','Pengguna','Sistem',`<circle cx='9' cy='8' r='3.5'/><path d='M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6'/><path d='M17 11l2 2 3.5-4'/>`],['pengaturan','Pengaturan','Sistem',`<path d='M4 7h10M18 7h2M4 17h2M10 17h10'/><circle cx='16' cy='7' r='2'/><circle cx='8' cy='17' r='2'/>`]];
/* ---------- Merek sekolah: logo unggahan atau lambang bawaan ---------- */
const Brand={
  mark(){return`<svg class='bm' viewBox='0 0 64 64' aria-hidden='true'><rect class='lr' width='64' height='64' rx='16'/><path class='lg' d='M32 17l20 9-20 9-20-9z'/><path class='lg' d='M20 34v8c0 3 6 6 12 6s12-3 12-6v-8l-12 5.5z'/><path class='lt' d='M52 26v14' fill='none' stroke-width='3' stroke-linecap='round'/></svg>`},
  url(){const p=db&&db.cfg&&db.cfg.logo;return p&&Data.logoUrl?Data.logoUrl(p):''},
  img(c,n){const u=Brand.url();return u?`<img class='${c||''}' src='${esc(u)}' alt='Logo ${esc(db.cfg.sekolah)}' width='${n}' height='${n}' onerror='Brand.bad(this)'>`:''},
  tile(n,c){const i=Brand.img('',n);return`<span class='bt ${i?'has':''} ${c||''}' style='width:${n}px;height:${n}px'>${i||Brand.mark()}</span>`},
  bad(e){const t=e.parentElement;e.remove();if(t&&t.classList.contains('bt')){t.classList.remove('has');t.innerHTML=Brand.mark()}},
  cached(){try{const k=JSON.parse(localStorage.getItem('sh.kop')||'{}');return{u:localStorage.getItem('sh.logo')||'',n:localStorage.getItem('sh.school')||'',a:localStorage.getItem('sh.app')||'',i:k.i||'',ad:k.ad||'',tl:k.tl||''}}catch(e){return{u:'',n:'',a:'',i:'',ad:'',tl:''}}},
  /* Nama aplikasi (default SekolahHub): dapat diubah admin di Pengaturan > Umum; layar masuk memakai salinan di perangkat */
  name(){const a=db&&db.cfg&&String(db.cfg.app_nama||'').trim();return a||Brand.cached().a||'SekolahHub'},
  /* Tunggu merek terbaru dari server (maks. ms) dan pramuat logonya, agar layar masuk digambar sekali dengan data yang benar, tanpa berganti rupa. */
  fresh:false,
  load(u){return new Promise(r=>{const i=new Image();i.onload=i.onerror=()=>r();i.src=u;if(i.decode)i.decode().then(r,r)})},
  async ready(ms){const p=Data.brandP;if(!p)return;
    await Promise.race([p.then(async b=>{if(b&&(b.n||b.u||b.a)){Brand.put(b);Brand.fresh=true;if(b.u)await Brand.load(b.u)}}),new Promise(r=>setTimeout(r,ms))])},
  put(o){try{o.u?localStorage.setItem('sh.logo',o.u):localStorage.removeItem('sh.logo');localStorage.setItem('sh.school',o.n||'');localStorage.setItem('sh.app',o.a||'');localStorage.setItem('sh.kop',JSON.stringify({i:o.i||'',ad:o.ad||'',tl:o.tl||''}))}catch(e){}},
  sync(){const u=Brand.url(),o=JSON.stringify(Brand.cached()),c=db.cfg;
    Brand.put({u,n:c.sekolah||'',a:c.app_nama||'',i:c.instansi||'',ad:c.alamat||'',tl:c.telp||''});
    const f=document.querySelector('link[rel=icon]');if(f){f.href=u||'icons/icon-192.png';f.type='image/png'}
    if(o!==JSON.stringify(Brand.cached()))dispatchEvent(new Event('brandchange'))}
};
let cur='dashboard';
function go(){const h=location.hash.slice(1);if(h.slice(0,7)=='profil-'){if(PID!=h.slice(7))PT='linimasa';PID=h.slice(7);cur='profil'}else if(h.slice(0,5)=='ubah-'){if(cur!='ubah')D={};PID=h.slice(5);cur='ubah'}else if(V[h]!==undefined){if(h!=cur){Q='';KF=''}cur=h}
if(portal()&&!PORTAL_OK().includes(cur))cur='portal';
let g='';Brand.sync();$('#nav').innerHTML=`<div class='brand'>${Brand.tile(36)}<div><h1>${esc(Brand.name())}</h1><small>${esc(db.cfg.sekolah)}</small></div></div>`+NAV.filter(navOk).map(n=>(n[2]!=g?(g=n[2],`<div class='grp'>${g}</div>`):'')+`<a href='#${n[0]}' class='${n[0]==(cur=='profil'||cur=='ubah'?'siswa':cur)?'on':''}'>${ico(n[3])}<span>${n[1]}</span></a>`).join('');
document.body.classList.toggle('ro',!Data.canWrite());document.body.dataset.v=cur;$('#app').innerHTML=vw(cur)();if(cur=='pengaturan'&&window.PG)PG.init();if(cur=='profil'&&window.ACC)ACC.profil();TB.upd((NAV.find(n=>n[0]==cur)||[0,cur=='ubah'?'Ubah profil':'Profil siswa'])[1])}
function lock(){return;const d=$('#dlg'),a=$('#app');a.style.visibility='hidden';d.oncancel=e=>e.preventDefault();d.innerHTML=`<h3>SekolahHub terkunci</h3><label>Masukkan PIN<input id='pin' type='password' inputmode='numeric' maxlength='6'></label><div id='err' style='color:var(--er);margin-bottom:6px'></div><div class='acts'><button class='p' id='ok'>Buka</button></div>`;d.showModal();
const t=()=>{if($('#pin').value==db.cfg.pin){lock.ok=1;d.oncancel=null;a.style.visibility='';d.close();go()}else{$('#err').textContent='PIN salah.';$('#pin').value=''}};$('#ok').onclick=t;$('#pin').onkeydown=e=>{if(e.key=='Enter')t()}}
addEventListener('hashchange',()=>{if(!db)return;go();scrollTo(0,0)});

/* ===== Modul tambahan: Absensi, Iuran, Bukti setoran, Ekspor CSV ===== */
const BL=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
let AK='',AV='input',AT=today(),IY=new Date().getFullYear(),IK='',IM=today().slice(0,7);
/* ===== Iuran mingguan =====
   Satu pembayaran = satu minggu (Senin sampai Minggu). iuran.minggu = tanggal Senin; iuran.bulan = bulan dari hari Senin itu,
   sehingga total bulanan/tahunan dan pembayaran bulanan lama (minggu kosong) tetap konsisten. Nominal db.cfg.iuran = per minggu. */
const isoD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const wkOf=t=>{const d=new Date(String(t).slice(0,10)+'T00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return isoD(d)};
const wkEnd=w=>{const d=new Date(w+'T00:00');d.setDate(d.getDate()+6);return isoD(d)};
const wksOf=ym=>{const y=+ym.slice(0,4),m=+ym.slice(5)-1,d=new Date(y,m,1),o=(d.getDay()+6)%7;if(o)d.setDate(d.getDate()+7-o);const r=[];while(d.getMonth()==m){r.push(isoD(d));d.setDate(d.getDate()+7)}return r};
const wkRange=w=>{const a=new Date(w+'T00:00'),b=new Date(wkEnd(w)+'T00:00');return a.getMonth()==b.getMonth()?a.getDate()+'–'+b.getDate()+' '+BL[b.getMonth()]:a.getDate()+' '+BL[a.getMonth()]+'–'+b.getDate()+' '+BL[b.getMonth()]};
const wkNo=w=>wksOf(w.slice(0,7)).indexOf(w)+1;
const wkTitle=w=>'Minggu ke-'+wkNo(w)+' '+BLF[+w.slice(5,7)-1]+' '+w.slice(0,4)+' ('+wkRange(w)+')';
const paidWeek=(sid,w)=>{w=w||wkOf(today());return db.iuran.filter(i=>i.sid==sid&&i.minggu==w).reduce((a,i)=>a+i.jml,0)};
/* Tunggakan = minggu yang sudah lewat (sebelum minggu berjalan) dan belum lunas. Dihitung sejak minggu pertama yang pernah tercatat
   di sistem (atau sejak siswa masuk, bila lebih baru), sehingga iuran yang baru diaktifkan tidak menimbulkan tunggakan semu. */
const iuranAnchor=()=>{let m='';db.iuran.forEach(i=>{if(i.minggu&&!i.rev_of&&(!m||i.minggu<m))m=i.minggu});return m||wkOf(today().slice(0,8)+'01')};
const arrearsOf=sid=>{const nom=+db.cfg.iuran||0,r={n:0,jml:0,ws:[]};if(!nom)return r;const s=db.siswa.find(x=>x.id==sid)||{},cw=wkOf(today());let w=iuranAnchor();if(s.masuk&&wkOf(s.masuk)>w)w=wkOf(s.masuk);
  for(let i=0;w<cw&&i<110;i++){const p=paidWeek(sid,w);if(p<nom){r.ws.push(w);r.jml+=nom-p}const d=new Date(w+'T00:00');d.setDate(d.getDate()+7);w=isoD(d)}r.n=r.ws.length;return r};
/* Setiap iuran mingguan otomatis menjadi pemasukan di Kas Kelas (id kas = 'iu_' + id iuran). Dijalankan di save(), jadi berlaku untuk
   pencatatan, pembatalan, impor, hapus siswa, dan pemulihan cadangan. Pembayaran bulanan lama (tanpa minggu) tidak disentuh. */
function syncKas(){
  const want=new Map();
  db.iuran.forEach(i=>{if(!i.minggu)return;const s=db.siswa.find(x=>x.id==i.sid);want.set('iu_'+i.id,{tgl:i.tgl||i.minggu,jenis:'masuk',jml:+i.jml||0,ket:(i.rev_of?'Pembatalan iuran mingguan · ':'Iuran mingguan · ')+(s?s.nama:'Siswa')+' · Mg '+wkNo(i.minggu)+' '+BL[+i.minggu.slice(5,7)-1]+' '+i.minggu.slice(0,4),kat:'Iuran',ref:i.ref||'',waktu:i.waktu||''})});
  db.kas=db.kas.filter(k=>!String(k.id).startsWith('iu_')||want.has(k.id));
  const have=new Map(db.kas.map(k=>[k.id,k]));
  want.forEach((v,id)=>{const k=have.get(id);if(!k)db.kas.push({id,...v});else for(const f in v)if(k[f]!==v[f])k[f]=v[f]})
}
const isAutoKas=k=>String(k.id).startsWith('iu_');


/* Absensi: satu menu dengan dua tab. "Catat harian" = input per kelas dan tanggal; "Laporan" = rekap/matriks untuk dicetak (statement.js). */
const ABS_ST=[['H','Hadir'],['S','Sakit'],['I','Izin'],['A','Alpa']];
function absInput(ks){
  const l=db.siswa.filter(s=>s.kelas==AK),mo=AT.slice(0,7),
  get=sid=>(db.absensi.find(a=>a.id==AT+'_'+sid)||{}).st||'',rk=(sid,k)=>db.absensi.filter(a=>a.sid==sid&&a.tgl.slice(0,7)==mo&&a.st==k).length,
  cn=k=>l.filter(s=>get(s.id)==k).length,kosong=l.filter(s=>!get(s.id)).length;
  const strip=window.ST?ST.sum([{l:'Hadir',v:cn('H'),c:'in'},{l:'Sakit',v:cn('S')},{l:'Izin',v:cn('I')},{l:'Alpa',v:cn('A'),c:'out'},{l:'Belum diisi',v:kosong,s:l.length?'dari '+l.length+' siswa':''}]):'';
  return`<div class='bar'><select onchange="AK=this.value;go()" aria-label='Kelas'>${ks.map(k=>`<option ${k==AK?'selected':''}>${esc(k)}</option>`).join('')}</select><input type='date' value='${AT}' max='${today()}' onchange="AT=this.value||today();go()" aria-label='Tanggal absensi'><span class='sp'></span><button onclick="IMP.open('absensi')">Impor Excel</button><button onclick='A.absReset()'>Kosongkan hari ini</button><button class='p' onclick='A.hadirSemua()'>Isi sisanya Hadir</button></div>${strip}<div class='card stcard'>${tbl(['Nama',...ABS_ST.map(x=>x[1]),'','Rekap bulan ini'],l.map(s=>`<tr><td><a class='pl' href='#profil-${s.id}'>${av(s,28)}<b>${esc(s.nama)}</b></a></td>${ABS_ST.map(x=>`<td><input type='radio' class='ra-${x[0]}' name='a_${s.id}' ${get(s.id)==x[0]?'checked':''} onclick="A.abs('${s.id}','${x[0]}')" aria-label='${x[1]}: ${esc(s.nama)}'></td>`).join('')}<td>${get(s.id)?`<button type='button' class='s' title='Hapus status absensi siswa ini' onclick="A.absClear('${s.id}')">Batal</button>`:''}</td><td class='mu'>H ${rk(s.id,'H')} · S ${rk(s.id,'S')} · I ${rk(s.id,'I')} · A ${rk(s.id,'A')}</td></tr>`),'Belum ada siswa di kelas ini.')}</div>`}
V.absensi=()=>{const ks=kelasList();if(!ks.includes(AK))AK=ks[0]||'';const lap=AV=='laporan'&&window.ST;
  return`<h2>Absensi</h2><p class='sub'>${lap?'Laporan kehadiran siswa untuk periode yang dipilih. Periksa pratinjau, lalu cetak atau simpan sebagai PDF.':'Catat kehadiran harian per kelas. Perubahan tersimpan otomatis. Salah input? Klik lagi pilihan yang aktif atau tombol <b>Batal</b> untuk menghapusnya.'}</p>`
  +(window.ST?`<div class='lp-top'>${ST.tabs([['input','Catat harian'],['laporan','Laporan']],lap?'laporan':'input','ST.av')}${lap?ST.absActs():''}</div>`:'')
  +(lap?ST.lapAbsBody():absInput(ks))};

V.iuran=()=>{
  if(Data.weekOk===false)return`<h2>Iuran Kelas</h2><div class='card'>${empty('Iuran mingguan butuh pembaruan database. Jalankan supabase/migrations/012_iuran_mingguan.sql di SQL Editor Supabase, lalu muat ulang halaman.')}</div>`;
  const nom=+db.cfg.iuran||0,l=db.siswa.filter(s=>!IK||s.kelas==IK),ws=wksOf(IM),cw=wkOf(today()),y=IM.slice(0,4),ids=new Set(l.map(s=>s.id)),
  mon=sid=>ws.reduce((a,w)=>a+paidWeek(sid,w),0),
  tm=l.reduce((a,s)=>a+mon(s.id),0),ty=db.iuran.filter(i=>ids.has(i.sid)&&i.bulan.slice(0,4)==y).reduce((a,i)=>a+i.jml,0),
  lunas=nom?l.filter(s=>paidWeek(s.id,cw)>=nom).length:null,
  ym=new Date(+y,+IM.slice(5)-1,1),ml=BLF[ym.getMonth()]+' '+y;
  return`<h2>Iuran Kelas</h2><p class='sub'>Iuran dibayar setiap minggu. Klik sel untuk mencatat atau membatalkan pembayaran; setiap pembayaran otomatis masuk ke Kas Kelas.</p>
<div class='grid'><div class='card'><div class='lab'>Iuran per minggu</div><div class='big'>${nom?rp(nom):'Belum diatur'}</div><div class='lab'>Atur di menu Pengaturan</div></div><div class='card'><div class='lab'>Terkumpul ${ml}</div><div class='big hero'>${rp(tm)}</div><div class='lab'>Tahun ${y}: ${rp(ty)}</div></div>${lunas!==null?`<div class='card'><div class='lab'>Lunas minggu ini</div><div class='big'>${lunas}/${l.length}</div><div class='lab'>${wkRange(cw)}</div></div>`:''}</div>
<div class='card' style='margin-bottom:14px'><div class='ch'><h3>Iuran terkumpul per minggu · ${ml}</h3><span class='lab'>dibanding target</span></div>${CH.bars(ws.map((w,i)=>'Mg '+(i+1)),[{n:'Terkumpul',c:'var(--pr)',v:ws.map(w=>l.reduce((a,x)=>a+paidWeek(x.id,w),0))},{n:'Target',c:'var(--ov)',v:ws.map(()=>nom*l.length)}])}</div>
<div class='bar'><select onchange="IK=this.value;go()"><option value=''>Semua kelas</option>${kelasList().map(k=>`<option ${k==IK?'selected':''}>${esc(k)}</option>`).join('')}</select><button onclick='A.iuranBulan(-1)' aria-label='Bulan sebelumnya'>‹</button><b>${ml}</b><button onclick='A.iuranBulan(1)' aria-label='Bulan berikutnya'>›</button><span class='sp'></span><button onclick="IMP.open('iuran')">Impor Excel</button><button class='p' onclick="A.iuranMassal('${ws.includes(cw)?cw:ws[0]}')">Lunaskan semua minggu ${ws.includes(cw)?'ini':'Mg 1'}</button></div>
<div class='card'>${tbl(['Nama',...ws.map((w,i)=>'Mg '+(i+1)+' ('+wkRange(w)+')'),'>Bulan ini'],l.map(s=>`<tr><td>${esc(s.nama)}</td>${ws.map(w=>{const p=paidWeek(s.id,w);return`<td><button class="s cell ${p&&p>=nom?'in':''}" title="${p?rp(p):'Belum bayar'}" onclick="A.bayar('${s.id}','${w}')">${p?(p>=nom?'✓':'~'):'·'}</button></td>`}).join('')}<td class='r'>${rp(mon(s.id))}</td></tr>`),'Belum ada siswa.')}</div>`};

function csv(name,rows){const t=rows.map(r=>r.map(c=>{c=c??'';if(typeof c=='string'&&/^[=+\-@]/.test(c))c="'"+c;return'"'+String(c).replace(/"/g,'""')+'"'}).join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+t],{type:'text/csv;charset=utf-8'}));a.download=name+'-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('File CSV diunduh')}

Object.assign(A,{
  abs(sid,st){const id=AT+'_'+sid,r=db.absensi.find(a=>a.id==id);
    if(r&&r.st==st){db.absensi=db.absensi.filter(a=>a.id!=id)}  /* klik ulang pilihan aktif = batalkan */
    else r?r.st=st:db.absensi.push({id,sid,tgl:AT,st});
    save();go()},
  absClear(sid){const id=AT+'_'+sid;if(!db.absensi.some(a=>a.id==id))return;db.absensi=db.absensi.filter(a=>a.id!=id);save();go()},
  absReset(){const ids=new Set(db.siswa.filter(s=>s.kelas==AK).map(s=>s.id)),n=db.absensi.filter(a=>a.tgl==AT&&ids.has(a.sid)).length;
    if(!n)return toast('Belum ada absensi pada tanggal ini');
    ask(`Kosongkan absensi kelas ${esc(AK)} tanggal ${AT} (${n} siswa)? Anda bisa mengisinya ulang setelah ini.`,()=>{db.absensi=db.absensi.filter(a=>!(a.tgl==AT&&ids.has(a.sid)))})},
  hadirSemua(){let n=0;db.siswa.filter(s=>s.kelas==AK).forEach(s=>{const id=AT+'_'+s.id;if(!db.absensi.some(a=>a.id==id)){db.absensi.push({id,sid:s.id,tgl:AT,st:'H'});n++}});logA('Absensi kelas '+AK+' '+AT+': '+n+' siswa dihadirkan');save();go()},
  bayar(sid,w){const ex=db.iuran.filter(i=>i.sid==sid&&i.minggu==w),n=sis(sid).nama,lb=wkTitle(w);
    if(ex.length)return ask('Batalkan pembayaran iuran '+esc(n)+' · '+esc(lb)+'? Catatan pemasukan di Kas Kelas ikut dihapus.',()=>db.iuran=db.iuran.filter(i=>!(i.sid==sid&&i.minggu==w)));
    form('Iuran '+esc(n)+' · '+esc(lb),[{k:'jml',l:'Jumlah (Rp)',t:'number',r:1,d:+db.cfg.iuran||''},{k:'tgl',l:'Tanggal bayar',t:'date',d:today(),r:1},{k:'cat',l:'Catatan (opsional)'}],{},o=>{o.jml=+o.jml;if(!(o.jml>0))return'Jumlah harus lebih dari 0.';db.iuran.push({id:uid(),sid,bulan:w.slice(0,7),minggu:w,jml:o.jml,tgl:o.tgl,cat:o.cat});LG=1;logA('Iuran '+n+' '+lb+': '+rp(o.jml)+' (masuk Kas Kelas)')},'Catat pembayaran')},
  iuranBulan(d){const x=new Date(+IM.slice(0,4),+IM.slice(5)-1+d,1);IM=isoD(x).slice(0,7);go()},
  iuranMassal(w){const nom=+db.cfg.iuran||0;if(!(nom>0))return toast('Isi nominal iuran per minggu di Pengaturan dulu');
    const l=db.siswa.filter(s=>(!IK||s.kelas==IK)&&!paidWeek(s.id,w));if(!l.length)return toast('Semua siswa sudah membayar minggu ini');
    ask('Catat iuran '+rp(nom)+' untuk '+l.length+' siswa yang belum membayar ('+esc(wkTitle(w))+')? Seluruhnya masuk ke Kas Kelas sebesar '+rp(nom*l.length)+'.',()=>{l.forEach(s=>db.iuran.push({id:uid(),sid:s.id,bulan:w.slice(0,7),minggu:w,jml:nom,tgl:today(),cat:''}))})},
  struk(id){const t=db.tab.find(x=>x.id==id);if(!t)return;const s=sis(t.sid),d=$('#dlg'),k=(a,b)=>`<div class='kv'><span class='mu'>${a}</span><b>${b}</b></div>`;
    d.innerHTML=`<h3>Bukti ${t.jenis=='setor'?'setoran':'penarikan'} tabungan</h3>${k('Sekolah',Brand.tile(22,'inl')+esc(db.cfg.sekolah))}${k('Tanggal',fd(t.tgl))}${k('Nama siswa',esc(s.nama))}${k('NIS / Kelas',esc(s.nis)+' / '+esc(s.kelas))}${k('Jumlah',`<span class='${t.jenis=='setor'?'in':'out'}'>${rp(t.jml)}</span>`)}${t.cat?k('Catatan',esc(t.cat)):''}${k('Saldo saat ini',rp(saldo(t.sid)))}<p class='lab'>No. ${esc(t.id)}</p><div class='acts'><button id='x'>Tutup</button><button onclick="A.waStruk('${t.id}')">WhatsApp wali</button><button class='p' id='pr'>Cetak</button></div>`;
    d.showModal();$('#x').onclick=()=>d.close();$('#pr').onclick=()=>{document.body.classList.add('pd');print();document.body.classList.remove('pd')}},
  csvLap(){const l=db.siswa.filter(s=>!RK||s.kelas==RK),f=(s,j)=>db.tab.filter(t=>t.sid==s.id&&t.jenis==j&&(!RB||t.tgl.slice(0,7)==RB)).reduce((a,t)=>a+t.jml,0);
    csv('rekap-tabungan',[['Nama','NIS','Kelas','Setor','Tarik','Saldo akhir'],...l.map(s=>[s.nama,s.nis,s.kelas,f(s,'setor'),f(s,'tarik'),saldo(s.id)])])},
  csvTrx(){csv('transaksi-tabungan',[['Tanggal','Nama','NIS','Kelas','Jenis','Jumlah','Catatan'],...db.tab.slice().sort((a,b)=>a.tgl.localeCompare(b.tgl)).map(t=>{const s=sis(t.sid);return[t.tgl,s.nama,s.nis,s.kelas,t.jenis,t.jml,t.cat]})])},
  csvSiswa(){csv('data-siswa',[['Nama','NIS','NISN','Kelas','Jenis kelamin','Tempat lahir','Tanggal lahir','Agama','Alamat','Kontak wali','Ayah','Ibu','Wali','Saldo'],...db.siswa.map(s=>[s.nama,s.nis,s.nisn,s.kelas,s.jk,s.tl,s.tgl,s.agama,s.alamat,s.hp,s.ayah,s.ibu,s.wali,saldo(s.id)])])}
});

/* ===== Pengingat WhatsApp ===== */
const BLF=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const WA_TAB='Yth. Orang tua/wali dari {nama} (kelas {kelas}). {sekolah} mengingatkan bahwa {nama} belum menabung bulan {bulan}. Saldo tabungan saat ini {saldo}. Terima kasih.';
const WA_IUR='Yth. Orang tua/wali dari {nama} (kelas {kelas}). Iuran kelas minggu ini ({minggu}) sebesar {nominal} belum lunas (kekurangan {kekurangan}). Mohon dibantu pembayarannya. Terima kasih. {sekolah}';
const waNum=h=>{let n=String(h||'').replace(/\D/g,'');if(!n)return'';if(n.startsWith('0'))n='62'+n.slice(1);else if(n.startsWith('8'))n='62'+n;return n.startsWith('62')&&n.length>=10&&n.length<=15?n:''};
const waUrl=(hp,t)=>{const n=waNum(hp);return n?'https://wa.me/'+n+'?text='+encodeURIComponent(t).replace(/'/g,'%27'):''};
const WA_TUNG='Yth. Orang tua/wali dari {nama} (kelas {kelas}). Menurut catatan {sekolah}, iuran kelas {nama} menunggak {minggu_tunggak} minggu dengan total {tunggakan}. Mohon dibantu pembayarannya. Terima kasih.';
const waText=(k,s)=>{const nom=+db.cfg.iuran||0,d=new Date(),ar=arrearsOf(s.id),v={tunggakan:rp(ar.jml),minggu_tunggak:ar.n,nama:s.nama,kelas:s.kelas,sekolah:db.cfg.sekolah,saldo:rp(saldo(s.id)),bulan:BLF[d.getMonth()]+' '+d.getFullYear(),minggu:wkRange(wkOf(today())),nominal:rp(nom),kekurangan:rp(Math.max(0,nom-paidWeek(s.id)))};
  return(k=='tab'?(db.cfg.watab||WA_TAB):k=='tung'?WA_TUNG:(db.cfg.waiuran||WA_IUR)).replace(/\{(\w+)\}/g,(m,x)=>v[x]??m)};
let PK='tab',PL='';const PGN={tab:'tabungan',iuran:'iuran',tung:'tunggakan'};
const pgList=()=>{const nom=+db.cfg.iuran||0,mo=today().slice(0,7),d=new Date();d.setHours(0,0,0,0);const t0=d.getTime(),nm=PGN[PK];
  return db.siswa.filter(s=>!PL||s.kelas==PL).filter(s=>PK=='tab'?!db.tab.some(t=>t.sid==s.id&&t.jenis=='setor'&&!t.rev_of&&t.tgl.slice(0,7)==mo):PK=='tung'?arrearsOf(s.id).n>0:nom>0&&paidWeek(s.id)<nom)
    .map(s=>({s,ok:!!waNum(s.hp),sent:db.log.some(x=>x.t>=t0&&x.m=='Pengingat '+nm+': '+s.nama)}))};
V.pengingat=()=>{const L=pgList(),ks=kelasList(),left=L.filter(x=>x.ok&&!x.sent).length,nom=+db.cfg.iuran||0;
  return`<h2>Pengingat WhatsApp</h2><p class='sub'>Kirim pengingat ke wali murid lewat WhatsApp. Pesan terisi otomatis, Anda tinggal menekan kirim di WhatsApp.</p>
<div class='bar'><button class='${PK=='tab'?'p':''}' onclick="PK='tab';go()">Belum menabung bulan ini</button><button class='${PK=='iuran'?'p':''}' onclick="PK='iuran';go()">Iuran minggu ini belum lunas</button><button class='${PK=='tung'?'p':''}' onclick="PK='tung';go()">Tunggakan iuran</button><select onchange="PL=this.value;go()"><option value=''>Semua kelas</option>${ks.map(k=>`<option ${k==PL?'selected':''}>${esc(k)}</option>`).join('')}</select><span class='sp'></span><button class='p' onclick='A.kirimNext()' ${left?'':'disabled'}>Kirim berikutnya (${left})</button></div>
${PK!='tab'&&!nom?`<div class='card'>${empty('Nominal iuran belum diatur. Isi di menu Pengaturan.')}</div>`:`<div class='card'>${tbl(['Nama','Kelas','Kontak wali',PK=='tung'?'>Tunggakan':PK=='iuran'?'>Kekurangan':'>Saldo','Status',''],L.map(x=>`<tr><td>${esc(x.s.nama)}</td><td>${esc(x.s.kelas)}</td><td>${esc(x.s.hp)||'-'}</td><td class='r'>${PK=='tung'?rp(arrearsOf(x.s.id).jml)+' <span class=\"lab\">('+arrearsOf(x.s.id).n+' mg)</span>':PK=='iuran'?rp(Math.max(0,nom-paidWeek(x.s.id))):rp(saldo(x.s.id))}</td><td>${x.sent?'<span class="tag in">Terkirim hari ini</span>':x.ok?'<span class="tag">Belum dikirim</span>':'<span class="tag out">Nomor tidak valid</span>'}</td><td class='r'><button class='s' ${x.ok?'':'disabled'} onclick="A.kirim('${PK}','${x.s.id}')">Kirim WA</button></td></tr>`),'Semua siswa sudah memenuhi. Tidak ada yang perlu diingatkan.')}</div>`}
${L.length&&(PK=='tab'||nom)?`<div class='card' style='margin-top:14px'><h3>Contoh pesan</h3><p style='margin:0;white-space:pre-wrap'>${esc(waText(PK,L[0].s))}</p><p class='lab' style='margin-bottom:0'>Isi pesan bisa diubah di menu Pengaturan.</p></div>`:''}`};
Object.assign(A,{
  kirim(k,sid){const s=sis(sid),u=waUrl(s.hp,waText(k,s));if(!u)return toast('Nomor kontak wali kosong atau tidak valid');window.open(u,'_blank','noopener');logA('Pengingat '+PGN[k]+': '+s.nama);save();go()},
  kirimNext(){const x=pgList().find(x=>x.ok&&!x.sent);if(!x)return toast('Tidak ada pesan yang tersisa');A.kirim(PK,x.s.id)},
  waStruk(id){const t=db.tab.find(x=>x.id==id);if(!t)return;const s=sis(t.sid),u=waUrl(s.hp,'Bukti '+(t.jenis=='setor'?'setoran':'penarikan')+' tabungan '+s.nama+' (kelas '+s.kelas+'): '+rp(t.jml)+' pada '+fd(t.tgl)+'. Saldo tabungan saat ini '+rp(saldo(t.sid))+'. Terima kasih. '+db.cfg.sekolah);if(!u)return toast('Nomor kontak wali kosong atau tidak valid');window.open(u,'_blank','noopener')}
});

Object.assign(A,{async migrasiFoto(){let n=0;try{for(const s of db.siswa)for(const k of ['foto','cover'])if(String(s[k]).startsWith('data:')){s[k]=await Data.upload(s.id,k,Data.dataToBlob(s[k]));n++}}catch(e){toast('Gagal memindahkan foto: '+e.message)}if(n){logA('Foto lama dipindahkan ke Storage: '+n+' file');save();toast(n+' foto dipindahkan')}go()}});

/* ===== Grafik (SVG murni, mengikuti tema warna) ===== */
const mk=off=>{const n=new Date(),d=new Date(n.getFullYear(),n.getMonth()+off,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const mlab=m=>BL[+m.slice(5)-1];
const tabM=(m,j)=>db.tab.filter(t=>t.jenis==j&&t.tgl.slice(0,7)==m).reduce((a,t)=>a+t.jml,0);
const net=m=>db.tab.filter(t=>t.tgl.slice(0,7)<=m).reduce((a,t)=>a+(t.jenis=='setor'?1:-1)*t.jml,0);
const CW=()=>window.innerWidth<640?360:560; // lebar grafik menyesuaikan layar agar teks tetap terbaca
const CH={
  nice(x){const p=Math.pow(10,Math.floor(Math.log10(x))),n=x/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p},
  short(v){const f=x=>String(+x.toFixed(1)).replace('.',',');return v>=1e6?f(v/1e6)+' jt':v>=1e3?f(v/1e3)+' rb':String(Math.round(v))},
  leg(s){return`<div class='leg'>${s.map(x=>`<span><i style='background:${x.c}'></i>${esc(x.n)}</span>`).join('')}</div>`},
  grid(W,pl,pr,pt,ih,mx){let g='';for(let i=0;i<=4;i++){const y=pt+ih-ih*i/4;g+=`<line x1='${pl}' x2='${W-pr}' y1='${y}' y2='${y}' class='gl'/><text x='${pl-6}' y='${y+4}' text-anchor='end' class='ct'>${CH.short(mx*i/4)}</text>`}return g},
  bars(lb,ser,H=210){const W=CW(),pl=46,pr=8,pt=10,pb=26,iw=W-pl-pr,ih=H-pt-pb,mx=CH.nice(Math.max(1000,...ser.flatMap(s=>s.v))),gw=iw/lb.length,bw=Math.min(34,gw*.72/ser.length);
    let g=CH.grid(W,pl,pr,pt,ih,mx);
    lb.forEach((l,i)=>{const cx=pl+gw*i+gw/2;g+=`<text x='${cx}' y='${H-8}' text-anchor='middle' class='ct'>${esc(l)}</text>`;
      ser.forEach((s,j)=>{const v=Math.max(0,s.v[i]||0),bh=ih*v/mx,x=cx-bw*ser.length/2+bw*j;g+=`<rect x='${x+1}' y='${pt+ih-bh}' width='${bw-2}' height='${v?Math.max(bh,2):0}' rx='3' style='fill:${s.c}'><title>${esc(s.n)} ${esc(l)}: ${rp(v)}</title></rect>`})});
    return`<svg viewBox='0 0 ${W} ${H}' class='chart' role='img'>${g}</svg>`+(ser.length>1?CH.leg(ser):'')},
  area(lb,v,c='var(--pr)',H=210){const W=CW(),pl=46,pr=14,pt=14,pb=26,iw=W-pl-pr,ih=H-pt-pb,mx=CH.nice(Math.max(1000,...v)),n=v.length,
    px=i=>pl+(n>1?iw*i/(n-1):iw/2),py=x=>pt+ih-ih*Math.max(0,x)/mx;let g=CH.grid(W,pl,pr,pt,ih,mx);
    lb.forEach((l,i)=>{if(n<=7||i%2==0||i==n-1)g+=`<text x='${px(i)}' y='${H-8}' text-anchor='middle' class='ct'>${esc(l)}</text>`});
    const line='M'+v.map((x,i)=>px(i)+','+py(x)).join(' L');
    g+=`<path d='${line} L${px(n-1)},${pt+ih} L${px(0)},${pt+ih}Z' style='fill:${c};opacity:.16'/><path d='${line}' style='fill:none;stroke:${c};stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round'/>`
      +v.map((x,i)=>`<circle cx='${px(i)}' cy='${py(x)}' r='3.5' style='fill:${c}'><title>${esc(lb[i])}: ${rp(x)}</title></circle>`).join('');
    return`<svg viewBox='0 0 ${W} ${H}' class='chart' role='img'>${g}</svg>`},
  donut(p,mid,sub){const t=p.reduce((a,x)=>a+x.v,0),R=54,C=2*Math.PI*R;let off=0;
    const segs=p.filter(x=>x.v>0).map(x=>{const l=C*x.v/t,s=`<circle cx='70' cy='70' r='${R}' fill='none' stroke-width='18' style='stroke:${x.c}' stroke-dasharray='${l} ${C-l}' stroke-dashoffset='${-off}' transform='rotate(-90 70 70)'><title>${esc(x.n)}: ${x.v}</title></circle>`;off+=l;return s}).join('');
    return`<div class='dn'><svg viewBox='0 0 140 140' class='donut' role='img'><circle cx='70' cy='70' r='${R}' fill='none' stroke-width='18' class='trk'/>${segs}<text x='70' y='70' text-anchor='middle' class='dv'>${mid}</text><text x='70' y='88' text-anchor='middle' class='ct'>${esc(sub)}</text></svg>${CH.leg(p.map(x=>({n:x.n+' · '+x.v,c:x.c})))}</div>`},
  hbar(rows){const mx=Math.max(1,...rows.map(r=>r.v));return rows.length?`<div class='hb'>${rows.map(r=>`<div class='hr'><span class='hn'>${esc(r.n)}</span><span class='ht'><i style='width:${Math.max(2,Math.max(0,r.v)/mx*100)}%'></i></span><b>${rp(r.v)}</b></div>`).join('')}</div>`:empty('Belum ada data.')}
};
const pn=(t,s,b)=>`<div class='card'><div class='ch'><h3>${t}</h3><span class='lab'>${s}</span></div>${b}</div>`;
const trendSvg=(sid,h)=>{const ks=[-5,-4,-3,-2,-1,0].map(mk);return CH.area(ks.map(mlab),ks.map(m=>db.tab.filter(t=>t.sid==sid&&t.tgl.slice(0,7)<=m).reduce((a,t)=>a+(t.jenis=='setor'?1:-1)*t.jml,0)),'var(--pr)',h)};
const trendCard=s=>pn('Perkembangan saldo','6 bulan terakhir',trendSvg(s.id,170)).replace("<div class='card'>","<div class='card' style='margin-top:14px'>");

/* ===== Top bar: pencarian global, tambah cepat, notifikasi, status simpan, menu akun ===== */
const navOk=n=>portal()?(Data.role=='siswa'?SWIDS:['portal','pengumuman','agenda']).includes(n[0]):n[0]!='portal'&&(n[0]!='pengguna'||Data.role=='admin');
const dstr=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const QA=[['Catat transaksi tabungan',()=>A.trx()],['Setoran massal per kelas',()=>A.massal()],['Catat absensi hari ini',()=>{location.hash='absensi'}],['Catat iuran',()=>{location.hash='iuran'}],['Catat kas kelas',()=>A.kas()],['Tambah siswa',()=>A.siswa()],['Buat pengumuman',()=>A.info()],['Tambah agenda',()=>A.agenda()]];
const TB={
  close(){document.querySelectorAll('#top .pop').forEach(p=>p.hidden=true)},
  toggle(id){const p=$('#'+id),was=!p.hidden;TB.close();if(!was){if(id=='nm')TB.notif();if(id=='am')TB.acct();if(id=='tm')p.innerHTML=Theme.menu();p.hidden=false}},
  q(i){TB.close();QA[i][1]()},
  pick(){$('#gs').value='';TB.close()},
  notifs(){const n=[],w=Data.canWrite(),nom=+db.cfg.iuran||0,m0=today().slice(0,7);
    if(w){const b=db.siswa.filter(s=>!db.tab.some(t=>t.sid==s.id&&t.jenis=='setor'&&t.tgl.slice(0,7)==m0)).length;if(b)n.push({t:b+' siswa belum menabung bulan ini',s:'Kirim pengingat ke wali murid',h:'#pengingat'})}
    if(nom){const u=db.siswa.filter(s=>paidWeek(s.id)<nom).length;if(u)n.push({t:u+' siswa iuran minggu ini belum lunas',s:'Minggu '+wkRange(wkOf(today())),h:w||Data.role=='siswa'?'#iuran':'#portal'})}
    db.agenda.filter(a=>a.tgl==today()||a.tgl==dstr(1)).forEach(a=>n.push({t:(a.tgl==today()?'Hari ini: ':'Besok: ')+a.judul,s:a.ket||'Agenda',h:'#agenda'}));
    db.siswa.filter(s=>s.tgl&&s.tgl.slice(5)==today().slice(5)).forEach(s=>n.push({t:'Ulang tahun '+s.nama,s:'Genap '+(+today().slice(0,4)-+s.tgl.slice(0,4))+' tahun',h:'#profil-'+s.id}));
    db.info.filter(a=>a.tgl>=dstr(-3)).forEach(a=>n.push({t:a.judul,s:'Pengumuman · '+fd(a.tgl),h:'#pengumuman'}));
    if(!portal())db.vote.filter(v=>v.open).forEach(v=>n.push({t:'Pemilihan dibuka: '+v.judul,s:'Siswa memberi suara lewat akunnya',h:'#voting'}));
    else if(Data.role=='siswa')db.vote.filter(v=>v.open&&!v.saya).forEach(v=>n.push({t:'Pemilihan dibuka: '+v.judul,s:'Berikan suara Anda',h:'#voting'}));
    return n},
  find(q){q=q.trim().toLowerCase();if(!q)return{s:[],m:[],a:[]};
    return{s:db.siswa.filter(s=>(s.nama+' '+s.nis+' '+s.kelas).toLowerCase().includes(q)).slice(0,6),
      m:NAV.filter(n=>navOk(n)&&n[1].toLowerCase().includes(q)).slice(0,4),
      a:Data.canWrite()?QA.map((a,i)=>[a[0],i]).filter(a=>a[0].toLowerCase().includes(q)).slice(0,4):[]}},
  search(){const g=$('#gs'),p=$('#gr'),q=g.value;if(!q.trim()){p.hidden=true;return}const r=TB.find(q);
    p.innerHTML=(r.s.length?'<h4>Siswa</h4>'+r.s.map(s=>`<a href='#profil-${s.id}' onclick='TB.pick()'>${av(s,28)}<div>${esc(s.nama)}<div class='sub2'>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)}</div></div></a>`).join(''):'')
      +(r.m.length?'<h4>Menu</h4>'+r.m.map(n=>`<a href='#${n[0]}' onclick='TB.pick()'>${ico(n[3])}${n[1]}</a>`).join(''):'')
      +(r.a.length?'<h4>Aksi cepat</h4>'+r.a.map(a=>`<button class='pi' onclick='TB.q(${a[1]});TB.pick()'>${a[0]}</button>`).join(''):'')
      ||`<div class='sub2' style='padding:12px'>Tidak ada hasil untuk “${esc(q)}”.</div>`;p.hidden=false},
  notif(){const n=TB.notifs();$('#nm').innerHTML='<h4>Notifikasi</h4>'+(n.length?n.map(x=>`<a href='${x.h}' onclick='TB.close()'><div>${esc(x.t)}<div class='sub2'>${esc(x.s)}</div></div></a>`).join(''):`<div class='sub2' style='padding:12px'>Semua beres, tidak ada yang perlu perhatian.</div>`)},
  acct(){const r=Data.role;$('#am').innerHTML=`<div style='padding:10px'><b style='word-break:break-all'>${esc(Data.user?.email||'')}</b><div class='sub2'>Peran: ${esc(ROLEL[r]||r)}</div></div><hr style='border:0;border-top:1px solid var(--br);margin:4px 0'>${!portal()?`<a href='#pengaturan' onclick='TB.close()'>Pengaturan</a><a href='#aktivitas' onclick='TB.close()'>Riwayat aktivitas</a>`:''}${r=='admin'?`<a href='#pengguna' onclick='TB.close()'>Kelola pengguna</a>`:''}<button class='pi' data-theme-cycle><span data-theme-icon></span><div>Tampilan<div class='sub2' data-theme-label></div></div></button><button class='pi' onclick='Data.logout()'>Keluar</button>`;Theme.refresh()},
  sync(s){const e=$('#sy');if(!e)return;e.className='sy '+(s=='saving'?'saving':s=='error'?'error':s=='offline'?'off':'');e.lastChild.textContent={ok:'Tersimpan',saving:'Menyimpan…',error:'Gagal menyimpan',offline:'Offline'}[s]||'Tersimpan'},
  upd(t){document.title=t+' – '+Brand.name();const a=$('#tp');if(!a)return;a.textContent=db.cfg.sekolah||Brand.name();$('#ts2').textContent=db.cfg.tahun?'Tahun ajaran '+db.cfg.tahun:'';
    const n=TB.notifs().length,b=$('#bd');b.hidden=!n;b.textContent=n>9?'9+':n;$('#ac').textContent=(Data.user?.email||'?')[0].toUpperCase()},
  init(){const t=$('#top');t.hidden=false;
    t.innerHTML=`<div class='tt'><b id='tp'></b><span id='ts2'></span></div>
<div class='ts dd'>${ico(`<circle cx='11' cy='11' r='7'/><path d='M20 20l-3.5-3.5'/>`)}<input id='gs' type='search' autocomplete='off' placeholder='Cari siswa, menu, atau aksi' aria-label='Pencarian'><kbd>/</kbd><div class='pop' id='gr' hidden></div></div>
<div class='ta'><span class='sy' id='sy'><i></i><span>Tersimpan</span></span>
<div class='dd'><button class='p' id='qa' onclick="TB.toggle('qm')">+ <span>Tambah</span></button><div class='pop' id='qm' hidden>${QA.map((a,i)=>`<button class='pi' onclick='TB.q(${i})'>${a[0]}</button>`).join('')}</div></div>
<div class='dd tdd'><button class='ib' id='thm' aria-label='Tampilan' title='Tampilan' aria-haspopup='true' onclick="TB.toggle('tm')"><span data-theme-icon></span></button><div class='pop' id='tm' hidden></div></div>
<div class='dd'><button class='ib' aria-label='Notifikasi' onclick="TB.toggle('nm')">${ico(`<path d='M6 17v-6a6 6 0 1112 0v6l1.5 2h-15z'/><path d='M10 21h4'/>`)}<b class='bdg' id='bd' hidden></b></button><div class='pop' id='nm' hidden></div></div>
<div class='dd'><button class='acc' id='ac' aria-label='Akun' onclick="TB.toggle('am')"></button><div class='pop' id='am' hidden></div></div></div>`;
    const g=$('#gs');g.oninput=TB.search;g.onfocus=TB.search;g.onkeydown=e=>{if(e.key=='Escape'){g.blur();TB.close()}if(e.key=='Enter'){const f=$('#gr a,#gr .pi');if(f)f.click()}};
    if(!TB.bound){TB.bound=1;
      document.addEventListener('click',e=>{if(!e.target.closest('.dd'))TB.close()});
      document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if((k=='/'&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))||((e.ctrlKey||e.metaKey)&&k=='k')){e.preventDefault();const g=$('#gs');if(g)g.focus()}});
      addEventListener('offline',()=>TB.sync('offline'));addEventListener('online',()=>TB.sync(Data.status||'ok'))}
    Data.onStatus=TB.sync;Theme.refresh()}
};

/* ===== Portal orang tua ===== */
V.portal=()=>{const mo=today().slice(0,7),nom=+db.cfg.iuran||0,ag=db.agenda.filter(a=>a.tgl>=today()).sort((a,b)=>a.tgl.localeCompare(b.tgl)).slice(0,3),inf=db.info.slice().sort((a,b)=>b.tgl.localeCompare(a.tgl)).slice(0,3);
  const kid=s=>{const sd=saldo(s.id),tg=+s.target||0,tx=db.tab.filter(t=>t.sid==s.id).sort((a,b)=>b.tgl.localeCompare(a.tgl)).slice(0,5),
    pm=paidWeek(s.id),ab=db.absensi.filter(a=>a.sid==s.id&&a.tgl.slice(0,7)==mo),c=k=>ab.filter(a=>a.st==k).length;
    return`<div class='card' style='margin-bottom:14px'><div class='post' style='align-items:center;margin-bottom:12px'>${av(s,56)}<div class='tx'><h3 style='margin:0;font-size:18px'>${esc(s.nama)}</h3><div class='lab'>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)}</div></div><a class='btn s' href='#profil-${s.id}'>Profil</a></div>
<div class='grid'><div class='card'><div class='lab'>Saldo tabungan</div><div class='big hero'>${rp(sd)}</div>${tg?`<div class='meter'><i style='width:${Math.max(0,Math.min(100,sd/tg*100))}%'></i></div><div class='lab'>Target ${rp(tg)}</div>`:''}</div>
<div class='card'><div class='lab'>Iuran minggu ini</div><div class='big ${nom&&pm>=nom?'in':''}'>${nom?(pm>=nom?'Lunas':pm?'Sebagian':'Belum bayar'):'-'}</div><div class='lab'>${pm?rp(pm)+' dibayar':nom?rp(nom)+' per minggu':''}</div></div>
<div class='card'><div class='lab'>Kehadiran bulan ini</div><div class='big'>${c('H')} hadir</div><div class='lab'>Sakit ${c('S')} · Izin ${c('I')} · Alpa ${c('A')}</div></div></div>
<h3>Perkembangan saldo</h3>${trendSvg(s.id,150)}<h3 style='margin-top:16px'>Transaksi terakhir</h3>${tbl(['Tanggal','Jenis','>Jumlah','Catatan'],tx.map(t=>`<tr><td>${fd(t.tgl)}</td><td>${BK.tabLbl(t)}</td><td class='r'>${BK.tabAmt(t)}</td><td>${esc(t.cat)}</td></tr>`),'Belum ada transaksi.')}</div>`};
  const sw=Data.role=='siswa';return`<h2>${sw?'Portal Siswa':'Portal Orang Tua'}</h2><p class='sub'>${esc(db.cfg.sekolah)} · Ringkasan tabungan, iuran, dan kehadiran ${sw?'Anda':'anak Anda'}.</p>`+
  (db.siswa.length?db.siswa.map(kid).join(''):`<div class='card'>${empty(sw?'Akun Anda belum ditautkan ke data siswa. Hubungi wali kelas atau admin sekolah.':'Belum ada anak yang ditautkan ke akun Anda. Hubungi wali kelas atau admin sekolah.')}</div>`)+
  `<div class='two'><div class='card'><h3>Pengumuman</h3>${inf.length?inf.map(a=>`<div class='item'><b>${esc(a.judul)}</b><div class='lab'>${fd(a.tgl)}</div><div>${esc(a.isi)}</div></div>`).join(''):empty('Belum ada pengumuman.')}</div><div class='card'><h3>Agenda mendatang</h3>${ag.length?ag.map(a=>`<div class='item'><b>${esc(a.judul)}</b><div class='lab'>${fd(a.tgl)} · ${esc(a.ket)}</div></div>`).join(''):empty('Belum ada agenda.')}</div></div>`};

/* ===== Pengguna (khusus admin): js/akun.js ===== */

/* ===== Autentikasi & boot ===== */
async function start(){
  $('#auth').hidden=true;load(await Data.pull());Brand.sync();if(Data.role=='siswa')NAV.find(n=>n[0]=='portal')[1]='Portal Saya';TB.init();go();window.hideSplash&&hideSplash();Theme.bind({get:Data.getTema,set:Data.setTema});if(portal()&&window.ACC)ACC.welcome();
  Data.onError=async e=>{toast(e.code=='42501'||/row-level|permission/i.test(e.message)?'Anda tidak punya izin untuk perubahan ini.':'Gagal menyimpan: '+e.message);load(await Data.pull());go()};
  Data.subscribe(async t=>{if($('#dlg').open||cur=='ubah'||(window.PGD&&PGD()))return false;try{await Data.refresh(db,t);go()}catch(e){console.warn(e)}})}
async function boot(){
  const done=()=>window.hideSplash&&hideSplash();
  try{await Data.init()}catch(e){const a=$('#auth');a.hidden=false;a.innerHTML=`<div class='card'><h1>Konfigurasi belum lengkap</h1><p class='lab'>${esc(e.message)}</p></div>`;done();return}
  if(!Data.user||Data.role=='pending'){await Brand.ready(1200);authScreen(Data.user?'pending':'login');done();return}
  start().catch(e=>{toast('Gagal memuat data: '+e.message);done()})}
document.readyState=='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
