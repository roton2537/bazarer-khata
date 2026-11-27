import React, {useRef} from 'react';
import {t} from '../lib/language.js';
import {useStore} from '../store.jsx';
import {rpc} from '../lib/supabase.js';
import {Btn,useAction} from '../ui.jsx';
import {Avatar} from './parts.jsx';

async function resizePhoto(file){
  if(!file.type.startsWith('image/') || file.size>12*1024*1024) throw new Error(t('১২ এমবি পর্যন্ত ছবি বেছে নিন।'));
  const bitmap=await createImageBitmap(file);
  try {
    const canvas=document.createElement('canvas');
    canvas.width=160;canvas.height=160;
    const size=Math.min(bitmap.width,bitmap.height);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,160,160);
    ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,160,160);
    return canvas.toDataURL('image/jpeg',0.8);
  } finally {bitmap.close();}
}
export default function ProfilePhoto(){
  const s=useStore();
  const input=useRef(null);
  const [busy,run]=useAction();
  const save=photo=>rpc('set_my_photo',{p_photo:photo}).then(()=>s.refresh());
  return <div className="profile-photo stack">
    <div className="profile-avatar"><Avatar name={s.profile?.name||s.me?.display_name||'?'} photo={s.profile?.avatar_data} /></div>
    <strong className="break">{s.profile?.name||s.me?.display_name}</strong>
    <input hidden ref={input} type="file" accept="image/*" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(async()=>save(await resizePhoto(file)),t('ছবি সংরক্ষিত হয়েছে।'));}}/>
    <Btn busy={busy} className="secondary" onClick={()=>input.current?.click()}>{t('প্রোফাইল ছবি পরিবর্তন করুন')}</Btn>
    {s.profile?.avatar_data && <Btn busy={busy} className="ghost" onClick={()=>run(()=>save(null),t('ছবি সরানো হয়েছে।'))}>{t('ছবি সরান')}</Btn>}
  </div>;
}
