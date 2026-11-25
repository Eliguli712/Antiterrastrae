// Preserve the absolute half-voxel coordinates and roughness in 32 bits per
// vertex by using a local unsigned origin for each source meshlet.
export function packNativeGrid(position, roughness) {
 const origin=[65535,65535,65535],maximum=[0,0,0];
 let roughMax=0;
 for(let i=0,k=0;i<roughness.length;i++,k+=3){
  for(let axis=0;axis<3;axis++){
   const value=position[k+axis];
   if(value<origin[axis])origin[axis]=value;
   if(value>maximum[axis])maximum[axis]=value;
  }
  if(roughness[i]>roughMax)roughMax=roughness[i];
 }
 const bits=maximum.map((value,axis)=>32-Math.clz32(value-origin[axis]));
 const yShift=bits[0],zShift=yShift+bits[1],roughShift=zShift+bits[2];
 if(roughShift>=32||roughShift+32-Math.clz32(roughMax)>32)throw Error('Native meshlet exceeds the lossless GPU packing range');
 const packed=new Uint16Array(roughness.length*2);
 for(let i=0,k=0,j=0;i<roughness.length;i++,k+=3,j+=2){
  const word=(position[k]-origin[0])|((position[k+1]-origin[1])<<yShift)|
   ((position[k+2]-origin[2])<<zShift)|(roughness[i]<<roughShift);
  packed[j]=word&65535;
  packed[j+1]=word>>>16;
 }
 return {packed,origin,shifts:[yShift,zShift,roughShift]};
}
