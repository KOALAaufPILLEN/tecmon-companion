# Altes Gesicht auf dem Visier überdecken und LED-Gesicht einsetzen.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SRC=os.environ['TECMON_3D']; OUT=os.environ['TECMON_3D_WORK']
from PIL import Image, ImageFilter, ImageChops
import faces
D=Image.open(SRC+'/texture_diffuse.png').convert('RGB')
E=Image.open(SRC+'/texture_emissive.png').convert('RGB')
X0,X1,Y0,Y1=670,1010,905,1465
# Visier = dunkle/lila Fläche im Gesichtsbereich, nicht Gold.
m=Image.new('L',D.size,0); px=D.load(); mp=m.load()
for x in range(X0,X1):
    for y in range(Y0,Y1):
        r,g,b=px[x,y]
        gold = r>110 and r-b>45 and g>70
        if not gold: mp[x,y]=255
m=m.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(3))

def bake(name):
    f=faces.face(name).rotate(-90,expand=True)   # Gesicht oben -> +x im Atlas
    base=Image.new('RGBA',f.size,(14,8,22,255)); base.alpha_composite(f)
    d=D.copy(); e=E.copy()
    vd=Image.new('RGB',D.size,(14,8,22)); vd.paste(base.convert('RGB'),(1005-f.size[0]+0,1185-f.size[1]//2))
    ve=Image.new('RGB',D.size,(0,0,0)); fe=Image.new('RGBA',f.size,(0,0,0,255)); fe.alpha_composite(f); ve.paste(fe.convert('RGB'),(1005-f.size[0],1185-f.size[1]//2))
    d.paste(vd,(0,0),m); e.paste(ve,(0,0),m)
    return d,e
if __name__=='__main__':
    for n in sys.argv[1:]:
        d,e=bake(n); d.save(f'{OUT}/diffuse_{n}.png'); e.save(f'{OUT}/emissive_{n}.png')
    N=Image.open(SRC+'/texture_normal.png').convert('RGB')
    N.paste(Image.new('RGB',N.size,(128,128,255)),(0,0),m); N.save(OUT+'/normal_flat.png')
