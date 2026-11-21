from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage as ndi
src=Image.open('master_src.png').convert('RGB')
a=np.array(src).astype(int); lum=a.sum(2)
dark=lum<25
lab,n=ndi.label(dark)
border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
outside=np.isin(lab,list(border))
outside=ndi.binary_dilation(outside,iterations=1)
alpha=(~outside).astype(np.float32)
alpha=np.array(Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9)))
rgba=np.dstack([np.array(src),alpha]).astype(np.uint8)
im=Image.fromarray(rgba,'RGBA').crop((25,25,1225,1225))
im.save('master_1200.png')
print(im.size, 'corner alpha',np.array(im)[2,2,3], 'center',np.array(im)[600,600,3])
# preview on checker
chk=Image.new('RGBA',im.size,(200,200,200,255)); 
for y in range(0,1200,40):
    for x in range(0,1200,40):
        if (x//40+y//40)%2: ImageDraw.Draw(chk).rectangle((x,y,x+39,y+39),fill=(140,140,140,255))
chk.alpha_composite(im); chk.convert('RGB').resize((500,500)).save('master_chk.png')
