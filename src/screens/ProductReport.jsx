import { t } from '../lib/language.js';
import React, {useState} from 'react';
import {useStore} from '../store.jsx';
import {fmtMoney, toBnDigits} from '../lib/format.js';
import {Field} from '../ui.jsx';

export default function ProductReport(){
  const s=useStore();
  const [search,setSearch]=useState('');
  const [buyer,setBuyer]=useState('');
  const [date,setDate]=useState('');
  const rows=new Map();
  for(const p of s.data.purchases){
    if (buyer && p.buyer_id!==buyer || date && p.bazar_date!==date) continue;
    const products=p.purchase_items.length?p.purchase_items:[{name:p.description,amount:p.amount}];
    for(const item of products){
      const name=item.name.trim();
      const key=name.normalize('NFC').toLocaleLowerCase();
      if(!key.includes(search.trim().normalize('NFC').toLocaleLowerCase()))continue;
      const row=rows.get(key)||{name,count:0,total:0};
      row.count++;row.total+=Number(item.amount);rows.set(key,row);
    }
  }
  const products=[...rows.values()].sort((a,b)=>b.total-a.total);
  return <section className="card section stack">
    <h2>{t("পণ্যভিত্তিক রিপোর্ট")}</h2>
    <div className="noprint">
      <Field label={t("পণ্য খুঁজুন")}><input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></Field>
      <Field label={t("ক্রেতা")}><select value={buyer} onChange={e=>setBuyer(e.target.value)}><option value="">{t("সব সদস্য")}</option>{s.data.members.map(m=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></Field>
      <Field label={t("তারিখ")}><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field>
      <button className="btn small secondary" onClick={()=>{setSearch('');setBuyer('');setDate('');}}>{t("সব পণ্য দেখুন")}</button>
    </div>
    <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
      <thead><tr><th>{t("পণ্য")}</th><th style={{textAlign:'center'}}>{t("কতবার")}</th><th style={{textAlign:'right'}}>{t("মোট খরচ")}</th></tr></thead>
      <tbody>{products.map(p=><tr key={p.name} style={{borderTop:'1px solid var(--line)'}}><td className="break" style={{padding:'10px 0'}}>{p.name}</td><td style={{textAlign:'center'}}>{toBnDigits(p.count)}</td><td style={{textAlign:'right'}}>{fmtMoney(p.total,s.group)}</td></tr>)}</tbody>
      <tfoot><tr><th>{t("সর্বমোট")}</th><th style={{textAlign:'center'}}>{toBnDigits(products.reduce((n,p)=>n+p.count,0))}</th><th style={{textAlign:'right'}}>{fmtMoney(products.reduce((n,p)=>n+p.total,0),s.group)}</th></tr></tfoot>
    </table>
    {!products.length&&<p className="muted">{t("কোনো পণ্য পাওয়া যায়নি।")}</p>}
  </section>;
}
