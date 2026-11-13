# Altes Gesicht auf dem Visier überdecken und LED-Gesicht einsetzen.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SRC=os.environ['TECMON_3D']; OUT=os.environ['TECMON_3D_WORK']
from PIL import Image, ImageFilter, ImageChops
import faces
STYLE=os.environ.get('TECMON_FACES','holo')
if STYLE in ('holo','gold'):
    import faces_holo
    def face_image(name): return faces_holo.face(name, STYLE)
else:
    def face_image(name): return faces.face(name)
D=Image.open(SRC+'/texture_diffuse.png').convert('RGB')
E=Image.open(SRC+'/texture_emissive.png').convert('RGB')
X0,X1,Y0,Y1=670,1010,905,1465
# Visier = dunkle/lila Fläche im Gesichtsbereich, nicht Gold.
m=Image.new('L',D.size,0); px=D.load(); mp=m.load()
# Zweite UV-Insel: unterer Visierrand mit einem Rest des alten Munds.
# Dritte Insel: unterer Visierbogen; das Gold bleibt, sonst entsteht ein dunkler Fleck am Kinn.
# Vierte Insel: Mundwinkel des alten Gesichts, ragt in der Vorderansicht ins Visier.
BOXES=[(X0,X1,Y0,Y1,False),(1120,1240,1590,1720,False),(1425,1560,0,110,False),(1995,2048,935,1015,True)]
for (bx0,bx1,by0,by1,whole) in BOXES:
  for x in range(bx0,bx1):
    for y in range(by0,by1):
        r,g,b=px[x,y]
        gold = r>110 and r-b>45 and g>70
        if whole or not gold: mp[x,y]=255
main=Image.new('L',D.size,0); main.paste(m.crop((X0,Y0,X1,Y1)),(X0,Y0))
rest=ImageChops.subtract(m,main).filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(2))
# Nur die Hauptfläche einziehen, damit das LED-Gesicht nicht an den Goldrand stößt.
m=ImageChops.lighter(main.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(3)),rest)

TILT=float(os.environ.get('TECMON_TILT','-7'))
CX,CY=int(os.environ.get('TECMON_CX','850')),int(os.environ.get('TECMON_CY','1185'))
def bake(name):
    # Gesicht oben -> +x im Atlas. TILT gleicht die Schräglage der UV-Insel aus,
    # sonst sitzt das rechte Auge in der Vorderansicht höher als das linke.
    f=face_image(name).rotate(-90+TILT,expand=True,resample=Image.BICUBIC)
    px0,py0=CX-f.size[0]//2,CY-f.size[1]//2
    base=Image.new('RGBA',f.size,(14,8,22,255)); base.alpha_composite(f)
    d=D.copy(); e=E.copy()
    from PIL import ImageStat
    # Visierreste außerhalb des Gesichts in der mittleren Visierfarbe (mit LED-Raster gemittelt) füllen.
    fe=Image.new('RGBA',f.size,(0,0,0,255)); fe.alpha_composite(f)
    avg_d=tuple(int(v) for v in ImageStat.Stat(base.convert('RGB')).mean); avg_e=tuple(int(v) for v in ImageStat.Stat(fe.convert('RGB')).mean)
    vd=Image.new('RGB',D.size,avg_d); vd.paste(base.convert('RGB'),(px0,py0))
    ve=Image.new('RGB',D.size,avg_e); ve.paste(fe.convert('RGB'),(px0,py0))
    d.paste(vd,(0,0),m); e.paste(ve,(0,0),m)
    return d,e
if __name__=='__main__':
    for n in sys.argv[1:]:
        d,e=bake(n); d.save(f'{OUT}/diffuse_{n}.png'); e.save(f'{OUT}/emissive_{n}.png')
    N=Image.open(SRC+'/texture_normal.png').convert('RGB')
    N.paste(Image.new('RGB',N.size,(128,128,255)),(0,0),m); N.save(OUT+'/normal_flat.png')
    # Visier matt und nicht metallisch, sonst spiegelt sich das Umgebungslicht wie ein zweiter Mund.
    for name, value in (('roughness', 200), ('metallic', 0)):
        T = Image.open(SRC + f'/texture_{name}.png').convert('RGB')
        T.paste(Image.new('RGB', T.size, (value, value, value)), (0, 0), m); T.save(OUT + f'/{name}_visor.png')
    m.save(OUT + '/visor_mask.png')
