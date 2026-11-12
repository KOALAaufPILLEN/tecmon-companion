import os, sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
W,H=530,310; P=15; R=5.2
EX,EY,MY=105,118,223
def ell(dx,dy,rx,ry): return (dx/rx)**2+(dy/ry)**2<=1
def ring(dx,dy,rx,ry,t): return ell(dx,dy,rx,ry) and not ell(dx,dy,rx-t,ry-t)
def eye(kind,dx,dy):
    if kind=='open': return ell(dx,dy,32,42)
    if kind=='blink': return abs(dy+2)<8 and abs(dx)<38
    if kind=='happy': return dy<6 and ring(dx,dy+8,38,38,15)
    if kind=='focus': return ell(dx,dy-6,36,22)
    if kind=='dot': return ell(dx,dy,16,16)
    return False
def mouth(kind,dx,dy):
    if kind=='smile': return dy>-12 and ring(dx,dy+14,64,44,20)
    if kind=='grin': return dy>-14 and ell(dx,dy+8,64,38)
    if kind=='talkA': return ell(dx,dy,38,28)
    if kind=='talkB': return ell(dx,dy,34,15)
    if kind=='flat': return abs(dy)<8 and abs(dx)<44
    return False
FACES={'idle':('open','smile'),'blink':('blink','smile'),'happy':('happy','grin'),'talkA':('open','talkA'),'talkB':('open','talkB'),'focus':('focus','flat'),'busy':('dot','flat')}
def face(name):
    e,m=FACES[name]
    lit=Image.new('L',(W,H),0); dim=Image.new('L',(W,H),0)
    dl,dd=ImageDraw.Draw(lit),ImageDraw.Draw(dim)
    for gy in range(13,H,P):
        for gx in range(10,W,P):
            on=eye(e,gx-(W/2-EX),gy-EY) or eye(e,gx-(W/2+EX),gy-EY) or mouth(m,gx-W/2,gy-MY)
            box=(gx-R,gy-R,gx+R,gy+R)
            (dl if on else dd).ellipse(box,fill=255)
    glow=lit.filter(ImageFilter.GaussianBlur(9))
    rgba=Image.new('RGBA',(W,H),(0,0,0,0))
    def lay(mask,col,alpha):
        layer=Image.new('RGBA',(W,H),col+(0,)); layer.putalpha(mask.point(lambda v:int(v*alpha))); rgba.alpha_composite(layer)
    lay(dim,(120,70,170),0.22); lay(glow,(170,70,255),0.9); lay(lit,(236,200,255),1.0)
    return rgba
if __name__=='__main__':
    for n in FACES:
        f=face(n); bg=Image.new('RGBA',(W,H),(16,9,24,255)); bg.alpha_composite(f); bg.save(os.path.join(sys.argv[1], n + '.png'))
