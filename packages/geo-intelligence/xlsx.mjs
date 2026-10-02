import { assert,clean } from "./common.mjs";

function crc32Table(){
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1;
    table[n]=c>>>0;
  }
  return table;
}
const CRC_TABLE=crc32Table();
function crc32(buf){
  let c=0xFFFFFFFF;
  for(const byte of buf) c=CRC_TABLE[(c^byte)&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n>>>0);return b;}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;}
function xml(value){
  return String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
}
function colName(index){
  let n=index+1,out="";
  while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}
  return out;
}
function zipStore(entries){
  let offset=0;const localParts=[],centralParts=[];
  for(const entry of entries){
    const name=Buffer.from(entry.name,"utf8"),data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data,"utf8");
    const crc=crc32(data);
    const local=Buffer.concat([
      u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(33),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data,
    ]);
    localParts.push(local);
    const central=Buffer.concat([
      u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(33),u32(crc),u32(data.length),u32(data.length),
      u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name,
    ]);
    centralParts.push(central);offset+=local.length;
  }
  const central=Buffer.concat(centralParts),locals=Buffer.concat(localParts);
  const end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(locals.length),u16(0)]);
  return Buffer.concat([locals,central,end]);
}
export function buildXlsxBuffer(rows,{sheet_name="Profiles"}={}){
  assert(Array.isArray(rows)&&rows.length>0,"XLSX rows required.");
  const columns=Object.keys(rows[0]);
  assert(columns.length>0,"XLSX columns required.");
  const safeSheet=clean(sheet_name,31).replace(/[\\/?*\[\]:]/g," ")||"Profiles";
  const matrix=[columns,...rows.map(row=>columns.map(k=>row[k]??""))];
  const sheetRows=matrix.map((row,r)=>`<row r="${r+1}">`+row.map((value,c)=>{
    const cell=colName(c)+(r+1);
    if(typeof value==="number"&&Number.isFinite(value)) return `<c r="${cell}"><v>${value}</v></c>`;
    if(typeof value==="boolean") return `<c r="${cell}" t="b"><v>${value?1:0}</v></c>`;
    return `<c r="${cell}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join("")+`</row>`).join("");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const types=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return zipStore([
    {name:"[Content_Types].xml",data:types},
    {name:"_rels/.rels",data:rootRels},
    {name:"xl/workbook.xml",data:workbook},
    {name:"xl/_rels/workbook.xml.rels",data:workbookRels},
    {name:"xl/worksheets/sheet1.xml",data:sheet},
  ]);
}
