# يستبدل شاشة البداية الافتراضية (شعار Capacitor) بشعار صُرّة على خلفية داكنة،
# بنفس مقاس كل نسخة (عمودي/أفقي/كل الكثافات) حتى لا تتمدد الصورة
import glob
from PIL import Image
BG = (7, 18, 34)
logo = Image.open('resources/icon.png').convert('RGB')
files = glob.glob('android/app/src/main/res/drawable*/splash.png')
for f in files:
    w, h = Image.open(f).size
    side = int(min(w, h) * 0.38)
    out = Image.new('RGB', (w, h), BG)
    out.paste(logo.resize((side, side), Image.LANCZOS), ((w - side) // 2, (h - side) // 2))
    out.save(f, optimize=True)
print('splash replaced:', len(files), 'files')
