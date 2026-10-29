# pip: pillow, qrcode
from PIL import Image, ImageDraw
import qrcode

img = qrcode.make("https://js-code-output.vercel.app/")
img.save("js-code-output-qr.png")
print("QR image created: js-code-output-qr.png")
print("Note: file downloads are not automatically attached by this basic endpoint.")
