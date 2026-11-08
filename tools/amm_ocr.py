import cv2,numpy as np,pytesseract,json,sys,re
out={}
for n in range(1,4):
    im=cv2.imread(f'm{n}.png'); H,W=im.shape[:2]
    bg=np.array([83,72,53]); m=(np.abs(im.astype(int)-bg).max(2)<=7).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    cnt,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    res=[]
    for c in cnt:
        x,y,w,h=cv2.boundingRect(c)
        if not (28<=h<=55 and 30<=w<=160) or x<140 or y<230 or y>2220 or x>1520: continue
        if cv2.contourArea(c)<0.75*w*h: continue
        crop=im[y:y+h,x:x+w]
        txt=(np.abs(crop.astype(int)-np.array([91,200,208])).max(2)<60).astype(np.uint8)*255
        if txt.sum()<255*40: continue
        big=cv2.resize(255-txt,None,fx=3,fy=3,interpolation=cv2.INTER_CUBIC); big=cv2.copyMakeBorder(big,20,20,20,20,cv2.BORDER_CONSTANT,value=255)
        t=pytesseract.image_to_string(big,config='--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').strip()
        if re.fullmatch(r'[A-Z]{1,2}\d{0,2}',t): res.append([t,x+w//2,y+h//2])
    out[n]=res; print(n,len(res),' '.join(r[0] for r in res))
json.dump(out,open('ocr.json','w'))
