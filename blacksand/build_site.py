import re, random, math, html as H
B='/tmp/claude-0/-home-claude/575217de-424c-543f-9f0a-80ca364bca6c/scratchpad/bsdesign/'
OUT='/home/claude/nilesheron-web/blacksand/index.html'
src=open('/home/claude/Black_Sand_Strategy_Summary.md').read()

def section(n, nxt):
    key=f'## {n}. '; i=src.index(key); j=src.index(f'## {nxt}. ') if isinstance(nxt,int) else src.index(nxt)
    body=src[i:j]; title=body.split('\n',1)[0][len(key):].strip()
    paras=[p.strip() for p in body.split('\n',1)[1].split('\n\n') if p.strip()]
    return title, paras
def md(p):
    p=re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', p); p=re.sub(r'(?<!\*)\*([^*]+?)\*(?!\*)', r'<i>\1</i>', p)
    return p
def P(p, cls=''): return f'<p class="{cls}">{md(p)}</p>'

BLUE='#5B7BFF'; GOLD='#D9A441'; CORAL='#FF7A59'; INK='#F2EADB'; SAND='#E7D8B4'; QUIET='#9A8F78'
CIRC=r'<div style="position: absolute; left: ([0-9.]+)px; top: ([0-9.]+)px; width: ([0-9.]+)px; height: ([0-9.]+)px; border-radius: 50%; background: (#[0-9A-Fa-f]{6})"></div>'
def circles(file):
    s=open(file).read(); out=[]
    for l,t,w,h,c in re.findall(CIRC,s):
        l,t,w=float(l),float(t),float(w); out.append((l+w/2,t+w/2,w/2,c))
    return out
random.seed(3)
def svg_circles(cs):
    return ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}" style="transition-delay:{random.randint(0,700)}ms"/>' for x,y,r,c in cs)

# hero mark
mc=circles(B+'project/Main.dc.html')
xs=[x-r for x,y,r,c in mc]+[x+r for x,y,r,c in mc]; ys=[y-r for x,y,r,c in mc]+[y+r for x,y,r,c in mc]
mx0,my0,mw,mh=min(xs)-6,min(ys)-6,max(xs)-min(xs)+12,max(ys)-min(ys)+12
hero_svg=f'<svg class="swarm mark" viewBox="{mx0:.0f} {my0:.0f} {mw:.0f} {mh:.0f}" aria-hidden="true">{svg_circles(mc)}</svg>'
back_svg=hero_svg.replace('class="swarm mark"','class="swarm mark small"')

# figure 1: capital stack
sc=circles(B+'src/Stack16.body.html')
T='font-family:Space Mono, monospace;letter-spacing:.14em;text-transform:uppercase'
fig1=f'''<svg class="swarm fig" viewBox="64 212 688 540" aria-label="Figure 1, the capital stack">
<text x="96" y="236" fill="{QUIET}" font-size="11" style="{T}">emerging →</text>
<text x="752" y="236" fill="{SAND}" font-size="11" text-anchor="end" style="{T}">→ established</text>
{svg_circles(sc)}
<g font-family="Syne, sans-serif" font-weight="800" font-size="20" letter-spacing="-0.02em">
<text x="64" y="346" fill="{BLUE}">Limited</text><text x="64" y="366" fill="{BLUE}">partners</text>
<text x="64" y="516" fill="{GOLD}">General</text><text x="64" y="536" fill="{GOLD}">partners</text>
<text x="64" y="698" fill="{CORAL}">Founders</text></g>
<g font-size="9.5" style="{T}"><text x="64" y="384" fill="{BLUE}">the supply</text><text x="64" y="554" fill="{GOLD}">the distribution</text><text x="64" y="716" fill="{CORAL}">the outcome</text></g>
</svg>'''

# map
def map_svg():
    W,Hh=360,300; X0,Y0,MW,MH=28,60,300,190
    cities={'Detroit':(-83.05,42.33),'Oakland':(-122.27,37.80),'Los Angeles':(-118.24,32.6),'Tulsa':(-95.99,36.15),'Houston':(-95.37,29.76),'Miami':(-80.19,25.76),'Washington':(-77.04,38.91)}
    lons=[c[0] for c in cities.values()]; lats=[c[1] for c in cities.values()]
    def proj(lon,lat): return X0+(lon-min(lons))/(max(lons)-min(lons))*MW, Y0+(max(lats)-lat)/(max(lats)-min(lats))*MH
    dx,dy=proj(*cities['Detroit']); s=f'<svg class="map fig" viewBox="0 0 {W} {Hh}" aria-label="Partner cities sending founders to Detroit">'
    for n,(lon,lat) in cities.items():
        if n=='Detroit': continue
        x,y=proj(lon,lat); s+=f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{dx:.1f}" y2="{dy:.1f}" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="2 3"/>'
    pins={'Oakland':(BLUE,'Kapor Capital · LP',(-6,14,'start')),'Los Angeles':(GOLD,'MaC Venture Capital · GP',(-6,14,'start')),'Tulsa':(CORAL,'ACT House · Founders',(0,16,'middle')),'Houston':(GOLD,'South Loop Ventures · GP',(0,14,'middle')),'Miami':(CORAL,'Node.Miami · Founders',(-6,4,'end')),'Washington':(GOLD,'100KM Ventures · GP',(4,16,'end'))}
    for n,(lon,lat) in cities.items():
        x,y=proj(lon,lat)
        if n=='Detroit':
            s+=f'<circle cx="{x-22:.1f}" cy="{y:.1f}" r="6" fill="{BLUE}"/><circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{GOLD}"/><path d="M {x:.1f} {y-6:.1f} A 6 6 0 0 0 {x:.1f} {y+6:.1f} Z" fill="{BLUE}"/><circle cx="{x+23:.1f}" cy="{y:.1f}" r="6" fill="{CORAL}"/>'
            s+=f'<text x="{x:.1f}" y="{y+24:.1f}" text-anchor="middle" font-family="Syne, sans-serif" font-weight="700" font-size="14" fill="currentColor">Detroit</text>'
            for k,t in enumerate(['U of M Endowment · LP','Song United · LP and GP','TechTown · Venture 313 · Black Tech Saturdays · Founder networks']):
                s+=f'<text x="{W-4}" y="{y-40+12*k:.1f}" text-anchor="end" font-family="Archivo, sans-serif" font-size="9" fill="currentColor" opacity=".7">{t}</text>'
        else:
            c,lab,(ox,oy,anc)=pins[n]; s+=f'<circle cx="{x:.1f}" cy="{y:.1f}" r="5" fill="{c}"/>'
            if n=='Oakland': s+=f'<circle cx="{x+13:.1f}" cy="{y:.1f}" r="5" fill="{GOLD}"/><text x="{x+ox:.1f}" y="{y+oy+22:.1f}" font-family="Archivo, sans-serif" font-size="9" fill="currentColor" opacity=".7">Black Ops VC · GP</text>'
            s+=f'<text x="{x+ox:.1f}" y="{y+oy:.1f}" text-anchor="{anc}" font-size="9" fill="currentColor" style="{T}">{n.upper()}</text><text x="{x+ox:.1f}" y="{y+oy+11:.1f}" text-anchor="{anc}" font-family="Archivo, sans-serif" font-size="9" fill="currentColor" opacity=".7">{lab}</text>'
    ly=Y0+MH+36
    for i,(c,t) in enumerate([(BLUE,'LPs'),(GOLD,'GPs'),(CORAL,'Founders')]): s+=f'<circle cx="{X0+i*78+5}" cy="{ly}" r="4" fill="{c}"/><text x="{X0+i*78+14}" y="{ly+3}" font-size="9" fill="currentColor" opacity=".7" style="{T}">{t.upper()}</text>'
    return s+'</svg>'

# ---------- sections ----------
t1,p1=section(1,2); t2,p2=section(2,3); t3,p3=section(3,4); t4,p4=section(4,5); t5,p5=section(5,6); t6,p6=section(6,7)
t7,p7=section(7,8); t8,p8=section(8,9); t9,p9=section(9,10); t10,p10=section(10,11); t11,p11=section(11,12); t12,p12=section(12,'### Sources')

def sec(num, title, cls, inner, id_=None):
    id_=id_ or f's{int(num)}'
    return f'<section id="{id_}" class="chapter {cls}"><div class="wrap"><div class="kicker reveal">{num} &nbsp;·&nbsp; {title}</div>{inner}</div></section>'
def hl(a,b,extra=''): return f'<h2 class="hl reveal {extra}">{a} <span class="g">{b}</span></h2>'
def pull(a,b,color='g'): return f'<p class="pull reveal">{a} <span class="{color}">{b}</span></p>'

# 1
s1_body=p1[1:]; s1_body[0]=s1_body[0].replace(' Capital is the hook that brings everyone to the table. Equity is what the table produces.','')
S1=sec('01',t1,'light', hl('With no building to carry,','the mission stands in the light.')+pull('Capital is the hook that brings everyone to the table.','Equity is what the table produces.')+'<div class="prose cols reveal">'+''.join(P(p) for p in s1_body)+'</div>')

# figure 1
FIG1=f'''<section id="fig1" class="chapter dark"><div class="wrap"><div class="kicker reveal">Who &nbsp;·&nbsp; Three communities</div>
{hl('Supply, distribution, outcomes.','Where they collide, capital moves.')}
<div class="reveal">{fig1}</div>
<p class="pull catch reveal">If you want to catch a <span class="c">founder</span>, bring a <span class="g">GP</span>.<br>If you want to catch a <span class="g">GP</span>, bring an <span class="b">LP</span>.<br>If you want to catch an <span class="b">LP</span>, make it easy and safe for them.</p>
<p class="prose reveal sand">Members get community amongst their peers, and exposure up and down stream within their community and beyond it.</p>
<div class="figcap">Figure 1 · The capital stack</div></div></section>'''

# 2
ns=p2[0].replace('**North Star.** ','').replace(' Sand Hill Road without the structural barriers and bias: a funding environment that values culture and understands that capacity does not present in only one way.','')
ap=p2[2].replace('**Approach.** ','')
tiles=[('⅓','c','What Black-founded startups raise in their first five years, against comparable non-Black startups. When a Black investor leads the round, the gap narrows by nearly fifty percentage points.','1'),('4–8×','g','The rate of Black and Hispanic investment partners at venture firms founded in the last decade, against older firms. That is where emerging managers come from.','2'),('0.32%','c','Share of US venture funding that went to Black-founded companies in 2025, down from 1.5 percent at the 2021 peak.','3')]
S2=sec('02',t2,'light', hl('Sand Hill Road,','without the structural barriers and bias.')+f'<div class="prose reveal"><p><b>North Star.</b> {ns} A funding environment that values culture and understands that capacity does not present in only one way.</p></div><div class="rule"></div><div class="label reveal">Why the structure produces equity &nbsp;·&nbsp; the evidence is consistent</div><div class="tiles reveal">'+''.join(f'<div class="tile"><div class="num {c}">{n}<sup>{s}</sup></div><p>{l}</p></div>' for n,c,l,s in tiles)+'</div>'+pull('The program does not treat equity as a separate workstream. It builds the capital stack','so that equity is what the stack produces.')+f'<div class="prose reveal"><p><b>Approach.</b> {ap}</p></div><ol class="sources reveal"><li>Cook, Marx &amp; Yimfor, "Funding Black High-Growth Startups," <i>Journal of Finance</i> (forthcoming); Columbia Business School brief, July 2024.</li><li>NVCA, Deloitte &amp; Venture Forward, <i>VC Human Capital Survey</i>, 4th ed. (2022 data).</li><li>Crunchbase News, "Black-founded startups\' share of US venture funding," May 28, 2026.</li></ol>')

# 3
LP=p3[1].replace('**Limited partners.** ',''); GP=p3[2].replace('**General partners.** ',''); FO=p3[3].replace('**Founders.** ','').replace(' The first task is to build this capital structure. Then more and more, the work is helping founders of color prepare to use it.',''); LIFT=p3[4]
LP_E,LP_M=LP.split(' Emerging LPs are '); LP_M='Emerging LPs are '+LP_M; GP_E,GP_M=GP.split(' Emerging GPs are '); GP_M='Emerging GPs are '+GP_M
LP_E=LP_E.replace('their peers,⁴','their peers,<sup>4</sup>')
grid=f'''<div class="egrid reveal"><div class="eh"></div><div class="eh">→ Established</div><div class="eh">Emerging →</div>
<div class="en b">Limited partners<small>the supply</small></div><div class="ec"><span class="mh">Established</span>{LP_E}</div><div class="ec"><span class="mh">Emerging</span>{LP_M}</div>
<div class="en g">General partners<small>the distribution</small></div><div class="ec"><span class="mh">Established</span>{GP_E}</div><div class="ec"><span class="mh">Emerging</span>{GP_M}</div></div>'''
S3=sec('03',t3,'light', hl('Connect every layer to the ones above and below it.','Grow each one.')+f'<div class="prose reveal"><p>{p3[0]}</p></div>'+grid+f'<div class="rule"></div><div class="en c reveal" style="margin-top:1.5rem">Founders<small>the outcome</small></div><div class="prose lead reveal"><p>{FO}</p></div>'+pull('The first task is to build this capital structure.','Then more and more, the work is helping founders of color prepare to use it.','c')+f'<div class="prose reveal"><p><b>The lift.</b> {LIFT}</p></div><p class="sources reveal">4 &nbsp;Knight Foundation, <i>Knight Diversity of Asset Managers Research Series: Industry</i> (Lerner et al., December 2021).</p>')

# 4
rows=[('Limited partners','b','Take vetted emerging-GP meetings, show up to convenings, and soft-circle intent.','A curated, Detroit-based pipeline into funds they would not otherwise see.'),('Established GPs','g','Mentorship hours, name association, and presence.','LP access and first look at emerging-GP deal flow.'),('Emerging GPs','g','Raising with and through the platform.','LPs, mentors, and deal flow in one place.'),('Founders','c','Being platformed.','A room full of capital that came to Detroit to find them.')]
ex='<div class="xgrid reveal"><div class="eh"></div><div class="eh ink">Commits</div><div class="eh sand">Gets</div>'+''.join(f'<div class="en {c}">{n}</div><div class="xc"><span class="mh">Commits</span>{a}</div><div class="xc sand"><span class="mh">Gets</span>{b}</div>' for n,c,a,b in rows)+'</div>'
S4=sec('04',t4,'dark', hl('None of them will commit alone.','Year One is casting before it is programming.')+'<div class="prose cols reveal">'+''.join(P(p) for p in p4[:3])+'</div>'+ex+f'<p class="note reveal">{p4[4].strip("*")}</p><div class="figcap">Figure 2 · The exchange</div>')

# 5
rooms=[('Funder · funder',['b','g','b2','g2']),('Funder · funder',['g','b','g2','b2']),('Funder · founder',['g','c','c2','c2']),('Funder · founder',['c','g','c2','g2']),('Partnered',['b','g','c','g2']),('Partnered',['g','c','b','c2'])]
rm='<div class="rooms reveal">'+''.join(f'<div class="room"><div class="box">'+''.join(f'<i class="d {d}"></i>' for d in ds)+f'</div><div class="rl">{l}</div></div>' for l,ds in rooms)+'</div>'
wf=p5[2].replace('**The whole founder.** ','').replace(' Our commitment is to see and support the whole founder: the company builder and the human, joint and several.','')
S5=sec('05',t5,'light', hl('Two kinds of room do the work.','Six rooms in Year One.')+f'<div class="prose cols reveal"><p>{p5[0]}</p></div><div class="rule"></div>'+rm+f'<div class="prose cols reveal"><p>{p5[1]}</p><p><b>The whole founder.</b> {wf}</p></div>'+pull('Our commitment is to see and support the whole founder:','the company builder and the human, joint and several.','c'))

# 6
d2=p6[1].replace(' For founders in Oakland, Tulsa, Houston, and South Florida, Detroit is where the lead and follow capital for pre-seed through Series A rounds gathers in one room.','')
d3=p6[2].replace(' The thing that makes Detroit the hub is not an address. It is that partners in four other cities send their founders here, and that it is an easy place for them to do it.','')
S6=sec('06',t6,'light', hl('The hub is not an address.','Partners in other cities send their founders here.')+f'<div class="split reveal"><div class="prose"><p>{p6[0]}</p></div><div class="mapwrap">{map_svg()}</div></div><div class="rule"></div><div class="prose cols reveal"><p>{d2}</p><p>{d3}</p></div>'+pull('For founders in Oakland, Tulsa, Houston, and South Florida,','Detroit is where the lead and follow capital for pre-seed through Series A rounds gathers in one room.'))

# 7
phases=[]
for ph in p7[2:7]:
    m=re.match(r'\*\*(Phase \d|Year Three), (.+?): (.+?)\.\*\* (.*)',ph); n,d,t,b=m.groups()
    d=d.replace(' to ',' – ')
    phases.append(f'<div class="ph reveal"><div class="pd">{n}<br><span>{d}</span></div><div class="pt"><h3>{t}.</h3><p>{b}</p></div></div>')
strip=f'''<div class="strip reveal"><div class="ticks"><span>Feb 2027</span><span>Feb 2028</span><span>Feb 2029</span><span>Jan 2030</span></div>
<div class="bar base"><span>Base · about $1.2M a year · Years One to Three</span></div>
<div class="raise"><span>Raise window · Jan – Jul 2028</span></div>
<div class="bar fund"><span>Funded programming · ramps from late Year Two</span></div>
<p class="sand small">About $1.5M a year of additional programming, GP first, then LP, then founder, sized to the first joint raise.</p></div>'''
S7=sec('07',t7,'dark', hl('Cast it. Prove it.','Raise on the proof.')+f'<div class="prose reveal sand"><p>{p7[0]} {p7[1]}</p></div><div class="phases">'+''.join(phases)+f'</div>{strip}<div class="prose reveal"><p>{p7[7]}</p></div><p class="note reveal">{p7[8].strip("*")}</p><div class="figcap">Figure 3 · Phases and resourcing</div>')

# 8
bul=[b[2:].strip() for b in p8[2].split('\n')]
marks=['<i class="d b"></i><i class="d g"></i><i class="d c"></i>','<i class="d g"></i>','<i class="d g"></i>','<i class="d c"></i>','<i class="d c"></i>']
ml='<ul class="metrics reveal">'+''.join(f'<li><span class="mk">{m}</span>{b}</li>' for m,b in zip(marks,bul))+'</ul>'
S8=sec('08',t8,'light', hl("We're not targeting activity.","We're targeting outcomes.")+f'<div class="prose reveal"><p>{p8[0].replace("We\'re not targeting activity. We\'re targeting outcomes. ","")}</p><p>{p8[1].replace(" Tracking stats like:","")}</p></div><div class="rule"></div><div class="label reveal">Tracked from the first room</div>'+ml+f'<div class="split reveal"><div><div class="big g">$1.5B</div><div class="label">Aggregate capital influence</div></div><div class="prose"><p>{p8[3].replace("The long-run target is $1.5 billion in aggregate capital influence: the","The long-run target: the")}</p></div></div><div class="prose reveal"><p>{md(p8[4])}</p></div>'+pull('Not programs launched, events held, or people trained.','Founders funded, dollars raised, GPs investing, LPs investing.'))

# 9 + 10
sup=p10[2].replace('**Support built for each community.** ',''); lead,rest=sup.split(' For emerging GPs, that is ')
gp='For emerging GPs, that is '+rest.split(' For founders, it is ')[0]; fo='For founders, it is '+rest.split(' For founders, it is ')[1].split(' For LPs, it is ')[0]; lp='For LPs, it is '+rest.split(' For LPs, it is ')[1]
S9=sec('09',t9,'light', hl('The playbook','is written in public.')+f'<div class="prose reveal"><p>{p9[0]}</p></div>')
S10=sec('10',t10,'light', hl('Infrastructure,','when it is time.')+f'<div class="prose cols reveal"><p>{md(p10[0])}</p><p>{md(p10[1])}</p></div><div class="rule"></div><div class="prose reveal"><p><b>Support built for each community.</b> {lead}</p></div><div class="three reveal"><div><h4 class="g">Emerging GPs</h4><p>{gp}</p></div><div><h4 class="c">Founders</h4><p>{fo}</p></div><div><h4 class="b">LPs</h4><p>{lp}</p></div></div>')

# 11
lv=[]
for name,amt,v,ph in zip(['Base','Mid','Full'],['$1.2M','$2.1–2.3M','$3.1–3.8M'],[1200,2200,3450],p11[1:4]):
    m=re.match(r'\*\*(.+?)\*\* (.*)',ph); tt,bb=m.groups()
    lv.append(f'<div class="lv reveal"><div class="ln"><div class="lname">{name}</div><div class="lamt">{amt} <span>a year</span></div><div class="lbar" style="width:{100*v/3450:.0f}%"></div></div><div class="lt"><b>{tt}</b> {bb}</div></div>')
S11=sec('11','Budget','dark', hl('Each level is a complete program at its size.','The levels nest.')+f'<div class="prose reveal sand"><p>{p11[0]}</p></div><div class="levels">'+''.join(lv)+'</div>'+pull('','The Base is the first fundraising conversation, and it is the one this document is written to open.')+f'<div class="prose reveal"><p>{p11[5]}</p></div><p class="note reveal">{p11[6].strip("*")}</p><div class="figcap">Figure 4 · Three levels</div>')

# 12
pr=''.join((lambda m: f'<div><h4 class="g">{m.group(1)}</h4><p>{m.group(2)}</p></div>')(re.match(r'\*\*(.+?)\*\* (.*)',q)) for q in p12[1:5])
S12=sec('12',t12,'light', hl('Relentless about the outcome.','Open about the how.')+f'<div class="prose lead reveal"><p>{p12[0]}</p></div><div class="rule"></div><div class="four reveal">{pr}</div>')

NAV=''.join(f'<a href="#s{i+1}">{i+1:02d}</a>' for i in range(12))
page=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Black Sand — Strategy Summary</title>
<meta name="description" content="Black Sand: a capital-led program to make Detroit the epicenter of early-stage venture for underrepresented founders and investors.">
<style>
@font-face{{font-family:'Syne';font-weight:800;src:url('/blacksand/fonts/syne-latin-800-normal.woff2') format('woff2');font-display:swap}}
@font-face{{font-family:'Syne';font-weight:700;src:url('/blacksand/fonts/syne-latin-700-normal.woff2') format('woff2');font-display:swap}}
@font-face{{font-family:'Archivo';font-weight:400;src:url('/blacksand/fonts/archivo-latin-400-normal.woff2') format('woff2');font-display:swap}}
@font-face{{font-family:'Archivo';font-weight:600;src:url('/blacksand/fonts/archivo-latin-600-normal.woff2') format('woff2');font-display:swap}}
@font-face{{font-family:'Space Mono';font-weight:400;src:url('/blacksand/fonts/space-mono-latin-400-normal.woff2') format('woff2');font-display:swap}}
:root{{--black:#0F0E0C;--ink:#F2EADB;--egg:#F3EDE0;--sand:#E7D8B4;--quiet:#9A8F78;--quietl:#6F665A;--gold:#D9A441;--goldl:#C98F2C;--blue:#5B7BFF;--bluel:#3F5FE6;--coral:#FF7A59;--corall:#E0633F;--line:#2E2B26}}
*{{box-sizing:border-box}}
html{{scroll-behavior:smooth;-webkit-text-size-adjust:100%;scroll-padding-top:56px}}
body{{padding-top:48px}}
body{{margin:0;background:var(--black);color:var(--ink);font-family:'Archivo',sans-serif;font-size:17px;line-height:1.55}}
a{{color:inherit}}
.wrap{{max-width:1040px;margin:0 auto;padding:0 24px}}
.mono,.kicker,.label,.figcap,.eh,.rl,.pd,.ticks,.lamt span,.mh{{font-family:'Space Mono',monospace;letter-spacing:.12em;text-transform:uppercase;font-size:12px}}
.kicker{{color:var(--quiet);margin-bottom:1.25rem}}
.light .kicker,.light .label,.light .figcap{{color:var(--quietl)}}
.hl{{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(28px,4.6vw,50px);line-height:1.04;letter-spacing:-.025em;margin:0 0 1.5rem;max-width:22ch}}
.g{{color:var(--gold)}}.b{{color:var(--blue)}}.c{{color:var(--coral)}}
.light .g{{color:var(--goldl)}}.light .b{{color:var(--bluel)}}.light .c{{color:var(--corall)}}
.chapter{{padding:clamp(56px,9vw,120px) 0}}
.dark{{background:var(--black);color:var(--ink)}}
.light{{background:var(--egg);color:var(--black)}}
.prose{{max-width:68ch}}.prose p{{margin:0 0 1.1em}}.prose.lead{{font-size:clamp(17px,1.5vw,20px)}}
.cols{{max-width:none;columns:2;column-gap:40px}}@media(max-width:760px){{.cols{{columns:1}}}}
.cols p{{break-inside:auto}}
.cols p:only-child{{margin-bottom:0}}
.sand{{color:var(--sand)}}
.pull{{font-family:'Syne',sans-serif;font-weight:700;font-size:clamp(20px,2.4vw,28px);line-height:1.3;letter-spacing:-.01em;margin:2rem 0;max-width:30ch}}
.pull.catch{{max-width:none}}
.rule{{height:2px;background:var(--gold);margin:2.5rem 0 1.25rem}}
.label{{margin-bottom:1rem;color:var(--quiet)}}
.note{{font-size:13px;line-height:1.5;font-style:italic;color:var(--quiet);max-width:68ch}}
.light .note{{color:var(--quietl)}}
.figcap{{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--quiet)}}
.light .figcap{{border-color:rgba(15,14,12,.18)}}
.small{{font-size:14px}}
/* nav */
nav{{position:fixed;top:0;left:0;right:0;z-index:10;background:rgba(15,14,12,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}}
nav .wrap{{display:flex;align-items:center;gap:1rem;height:48px;overflow-x:auto;scrollbar-width:none}}
nav .wrap::-webkit-scrollbar{{display:none}}
nav .brand{{font-family:'Syne',sans-serif;font-weight:800;letter-spacing:.06em;font-size:13px;white-space:nowrap;text-decoration:none;margin-right:auto}}
nav a.n{{font-family:'Space Mono',monospace;font-size:11px;letter-spacing:.1em;color:var(--quiet);text-decoration:none;padding:4px 2px;border-bottom:2px solid transparent}}
nav a.n.cur{{color:var(--gold);border-color:var(--gold)}}
/* hero */
.hero{{min-height:calc(100svh - 48px);display:flex;flex-direction:column;justify-content:center;padding:48px 0 64px;position:relative}}
.hero .top{{display:flex;justify-content:space-between;gap:1rem;color:var(--quiet);flex-wrap:wrap;margin-bottom:auto}}
.mark{{display:block;width:min(56vw,420px);margin:5vh auto 3vh}}
.mark.small{{width:140px;margin:0 auto 2rem}}
.word{{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(28px,7.2vw,88px);letter-spacing:.02em;line-height:1;text-align:center;margin:0;white-space:nowrap}}
.tag{{text-align:center;margin:1rem 0 3rem;color:var(--sand)}}
.hero .foot{{display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap;margin-top:auto;align-items:flex-end}}
.hero .thesis{{font-size:clamp(17px,1.6vw,20px);max-width:28ch;margin:0}}
.hero .prep{{font-family:'Space Mono',monospace;font-size:12px;line-height:1.7;color:var(--quiet);text-align:right}}
/* swarm */
svg text{{font-family:"Archivo",sans-serif}}
svg text[font-family^="Syne"]{{font-family:"Syne",sans-serif!important}}
svg text[style*="Space Mono"]{{font-family:"Space Mono",monospace!important}}
.swarm circle{{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .7s cubic-bezier(.2,.8,.2,1)}}
.swarm.in circle{{transform:scale(1)}}
.fig{{display:block;width:100%;max-width:720px;height:auto;margin:1rem 0 2rem}}
/* reveal */
.reveal{{opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease}}
.reveal.in{{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){{.reveal,.swarm circle{{transition:none;opacity:1;transform:none}}}}
/* tiles */
.tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2rem;margin:1.5rem 0}}
.tile .num{{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(40px,5vw,56px);line-height:1;letter-spacing:-.04em;white-space:nowrap}}
.tile .num sup{{font-size:13px;color:var(--quietl);letter-spacing:0;margin-left:4px}}
.tile p{{font-size:14.5px;line-height:1.5;margin:.75rem 0 0}}
.sources{{font-family:'Space Mono',monospace;font-size:10.5px;line-height:1.6;color:var(--quietl);padding-left:1.2em;margin-top:2rem}}
p.sources{{padding-left:0}}
/* established/emerging grid */
.egrid,.xgrid{{display:grid;grid-template-columns:170px 1fr 1fr;gap:1.25rem 2rem;margin:2rem 0;align-items:start}}
.eh{{color:var(--quietl);padding-bottom:.5rem;border-bottom:2px solid var(--gold)}}
.dark .eh{{color:var(--quiet)}}.eh.ink{{color:var(--ink)}}.eh.sand{{color:var(--sand)}}
.en{{font-family:'Syne',sans-serif;font-weight:700;font-size:21px;line-height:1.1;letter-spacing:-.02em}}
.en+.prose{{margin-top:1.25rem}}
.en small{{display:block;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-top:.5rem}}
.ec,.xc{{font-size:15px;line-height:1.5}}
.xgrid{{grid-template-columns:170px 1fr 1fr;row-gap:1.25rem}}
.xgrid .en{{font-size:17px}}.xc{{border-top:1px solid var(--line);padding-top:.75rem}}.xgrid .en{{border-top:1px solid var(--line);padding-top:.75rem}}
.mh{{display:none}}
@media(max-width:700px){{.egrid,.xgrid{{grid-template-columns:1fr;gap:.75rem}}.eh{{display:none}}.mh{{display:block;color:var(--quietl);margin-bottom:.25rem}}.dark .mh{{color:var(--quiet)}}.en{{margin-top:1.25rem}}.xgrid .en,.xc{{border:0;padding-top:0}}}}
/* rooms */
.rooms{{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1rem;margin:1.5rem 0 2.5rem}}
.box{{border:1.5px solid currentColor;height:60px;display:flex;align-items:center;justify-content:center;gap:5px}}
.d{{display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--gold)}}
.d.b{{background:var(--blue)}}.d.c{{background:var(--coral)}}.d.g{{background:var(--gold)}}
.d.b2{{background:var(--blue);width:8px;height:8px}}.d.c2{{background:var(--coral);width:8px;height:8px}}.d.g2{{background:var(--gold);width:8px;height:8px}}
.rl{{font-size:9.5px;letter-spacing:.08em;margin-top:.5rem;color:var(--quietl)}}
/* map */
.split{{display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:start;margin:1.5rem 0}}
@media(max-width:760px){{.split{{grid-template-columns:1fr;gap:1.5rem}}}}
.map{{width:100%;height:auto;display:block;overflow:visible}}
.mapwrap{{color:var(--black)}}
/* timeline */
.phases{{margin:2.5rem 0 2rem}}
.ph{{display:grid;grid-template-columns:160px 1fr;gap:1.5rem;padding:1.25rem 0;border-top:1px solid var(--line)}}
.ph .pd{{color:var(--quiet);line-height:1.6}}.ph .pd span{{color:var(--sand)}}
.ph h3{{font-family:'Syne',sans-serif;font-weight:700;font-size:20px;letter-spacing:-.015em;margin:0 0 .5rem;color:var(--gold)}}
.ph p{{margin:0;font-size:15.5px;line-height:1.5}}
@media(max-width:600px){{.ph{{grid-template-columns:1fr;gap:.5rem}}}}
.strip{{margin:2.5rem 0;border-top:2px solid var(--gold);padding-top:.75rem}}
.ticks{{display:flex;justify-content:space-between;color:var(--quiet);font-size:10px;margin-bottom:.75rem}}
.bar{{height:18px;display:flex;align-items:center;padding-left:8px;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--black);white-space:nowrap;overflow:hidden}}
.bar.base{{background:var(--gold);opacity:.75}}
.raise{{margin:.5rem 0 .5rem 30.5%;width:16.7%;border:1.5px solid var(--sand);border-top:0;height:10px;position:relative}}
.raise span{{position:absolute;top:12px;left:0;white-space:nowrap;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--sand)}}
.bar.fund{{margin:1.75rem 0 0 50%;width:50%;background:var(--coral);opacity:.9}}
@media(max-width:600px){{.bar{{font-size:8px}}}}
/* metrics */
.metrics{{list-style:none;padding:0;margin:0 0 2.5rem;max-width:72ch}}
.metrics li{{display:flex;gap:.9rem;align-items:flex-start;margin:0 0 .8rem;font-size:16px}}
.mk{{display:inline-flex;gap:3px;flex:0 0 auto;padding-top:6px}}.mk .d{{width:10px;height:10px}}
.big{{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(56px,8vw,88px);line-height:1;letter-spacing:-.04em}}
/* three / four */
.three,.four{{display:grid;gap:2rem;margin:1.5rem 0}}
.three{{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
.four{{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}}
.three h4,.four h4{{font-family:'Syne',sans-serif;font-weight:700;font-size:20px;letter-spacing:-.015em;margin:0 0 .5rem;line-height:1.15}}
.three p,.four p{{margin:0;font-size:15.5px;line-height:1.5}}
/* levels */
.levels{{margin:2rem 0}}
.lv{{display:grid;grid-template-columns:220px 1fr;gap:1.5rem;padding:1.5rem 0;border-top:1px solid var(--line)}}
.lname{{font-family:'Syne',sans-serif;font-weight:800;font-size:26px;letter-spacing:-.02em;color:var(--gold)}}
.lamt{{font-family:'Syne',sans-serif;font-weight:700;font-size:16px;margin:.25rem 0 .6rem}}.lamt span{{font-size:9px;color:var(--quiet);margin-left:6px}}
.lbar{{height:8px;background:var(--gold)}}
.lt{{font-size:15.5px;line-height:1.5}}.lt b{{color:var(--sand)}}
@media(max-width:600px){{.lv{{grid-template-columns:1fr;gap:.75rem}}}}
/* footer */
footer{{padding:clamp(64px,10vw,140px) 0 48px;text-align:center}}
footer .word{{font-size:clamp(28px,5vw,48px)}}
footer .catch{{margin:2.5rem auto;max-width:none;color:var(--sand)}}
footer .meta{{display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap;text-align:left;font-family:'Space Mono',monospace;font-size:11px;line-height:1.7;color:var(--quiet);margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line)}}
footer .meta .r{{text-align:right}}
</style>
</head>
<body>
<nav><div class="wrap"><a class="brand" href="#top">BLACK SAND</a>{''.join(f'<a class="n" href="#s{i+1}">{i+1:02d}</a>' for i in range(12))}</div></nav>
<header id="top" class="hero dark"><div class="wrap" style="display:flex;flex-direction:column;min-height:calc(100svh - 48px)">
<div class="top mono"><span>Strategy summary &nbsp;·&nbsp; Draft 5 &nbsp;·&nbsp; October 2026</span><span>Working title. The name is under development.</span></div>
{hero_svg}
<h1 class="word">BLACK SAND</h1>
<p class="tag mono">Detroit &nbsp;·&nbsp; Capital-led, equitably informed</p>
<div class="foot"><p class="thesis"><b>Capital is the hook</b> that brings everyone to the table.<br><b>Equity is what the table produces.</b></p><div class="prep">Prepared for Song Foundation<br>Khalilah Burt-Gaston, Dug Song<br><br>Prepared by Niles Heron</div></div>
</div></header>
<main>
{S1}{FIG1}{S2}{S3}{S4}{S5}{S6}{S7}{S8}{S9}{S10}{S11}{S12}
</main>
<footer class="dark"><div class="wrap">
{back_svg}
<div class="word">BLACK SAND</div>
<p class="tag mono">Detroit &nbsp;·&nbsp; Capital-led, equitably informed</p>
<p class="pull catch reveal">If you want to catch a founder, bring a GP.<br>If you want to catch a GP, bring an LP.<br>If you want to catch an LP, <span class="g">make it easy and safe for them.</span></p>
<div class="meta"><span>Prepared for Song Foundation<br>Khalilah Burt-Gaston, Dug Song</span><span class="r">Niles Heron<br>niles@verseandhook.com</span></div>
<p class="mono" style="color:var(--quiet);margin-top:2rem">Formerly the Center for Tech Equity &nbsp;·&nbsp; Draft 5 &nbsp;·&nbsp; October 2026 &nbsp;·&nbsp; <a href="/blacksand/budget">Budget model</a></p>
</div></footer>
<script>
(function(){{
  var io=new IntersectionObserver(function(es){{es.forEach(function(e){{if(e.isIntersecting){{e.target.classList.add('in');io.unobserve(e.target);}}}});}},{{rootMargin:'0px 0px -10% 0px',threshold:.1}});
  document.querySelectorAll('.reveal,.swarm').forEach(function(el){{io.observe(el);}});
  var links=[].slice.call(document.querySelectorAll('nav a.n'));var secs=links.map(function(a){{return document.querySelector(a.getAttribute('href'));}});
  var so=new IntersectionObserver(function(es){{es.forEach(function(e){{if(e.isIntersecting){{var i=secs.indexOf(e.target);links.forEach(function(a,j){{a.classList.toggle('cur',j===i);}});var a=links[i];if(a&&a.scrollIntoView)a.scrollIntoView({{block:'nearest',inline:'center',behavior:'smooth'}});}}}});}},{{rootMargin:'-40% 0px -55% 0px'}});
  secs.forEach(function(s){{if(s)so.observe(s);}});
}})();
</script>
</body>
</html>
'''
open(OUT,'w').write(page); print(len(page))
