#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <numeric>
#include <string>
#include <vector>
constexpr int W=2400,H=2800;
struct V{float x,y,z,nx,ny,nz,r,g,b,R,G,B;};
struct P{float x,y,z,r,g,b,R,G,B;};
struct Plate{std::vector<float> z;std::vector<uint8_t>a,b;};
std::array<Plate,3> plates;
float dot(float x,float y,float z,float a,float b,float c){return x*a+y*b+z*c;}
void triangle(Plate&o,const P&a,const P&b,const P&c,bool glass){
 float area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(std::abs(area)<1e-8)return;
 int x0=std::max(0,(int)std::floor(std::min({a.x,b.x,c.x}))),x1=std::min(W-1,(int)std::ceil(std::max({a.x,b.x,c.x})));
 int y0=std::max(0,(int)std::floor(std::min({a.y,b.y,c.y}))),y1=std::min(H-1,(int)std::ceil(std::max({a.y,b.y,c.y})));
 for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){
  float u=((b.x-x-.5f)*(c.y-y-.5f)-(b.y-y-.5f)*(c.x-x-.5f))/area;
  float v=((c.x-x-.5f)*(a.y-y-.5f)-(c.y-y-.5f)*(a.x-x-.5f))/area,w=1-u-v;
  if(std::min({u,v,w})<-.00001f)continue;float z=u*a.z+v*b.z+w*c.z;int i=y*W+x;if(z>o.z[i])continue;
  float rgb[2][3]={{u*a.r+v*b.r+w*c.r,u*a.g+v*b.g+w*c.g,u*a.b+v*b.b+w*c.b},{u*a.R+v*b.R+w*c.R,u*a.G+v*b.G+w*c.G,u*a.B+v*b.B+w*c.B}};
  for(int k=0;k<2;k++){auto&im=k?o.b:o.a;float alpha=glass?.065f:1.f,old=im[4*i+3]/255.f,next=alpha+old*(1-alpha);for(int j=0;j<3;j++)im[4*i+j]=(uint8_t)std::clamp((rgb[k][j]*alpha+im[4*i+j]/255.f*old*(1-alpha))/std::max(.00001f,next)*255.f,0.f,255.f);im[4*i+3]=(uint8_t)(next*255.f);}if(!glass)o.z[i]=z;
 }
}
int main(int argc,char**argv){if(argc!=2)return 2;for(auto&o:plates){o.z.assign(W*H,1e30f);o.a.assign(W*H*4,0);o.b.assign(W*H*4,0);}uint32_t nv,nf,glass;long long faces=0;float yaw[3]={0,.49f,3.14159265f},pitch[3]={.12f,.30f,.12f};
 while(std::cin.read((char*)&nv,4)){std::cin.read((char*)&nf,4);std::cin.read((char*)&glass,4);std::vector<V>vs(nv);std::vector<uint32_t>f(nf*3);std::cin.read((char*)vs.data(),nv*sizeof(V));std::cin.read((char*)f.data(),nf*12);if(!std::cin)return 3;
  for(int view=0;view<3;view++){float sy=std::sin(yaw[view]),cy=std::cos(yaw[view]),sp=std::sin(pitch[view]),cp=std::cos(pitch[view]);std::vector<P>p(nv);
   for(uint32_t i=0;i<nv;i++){auto&q=vs[i];float z=q.z-96,nx=dot(q.nx,q.ny,q.nz,cy,sy,0),ny=dot(q.nx,q.ny,q.nz,-sy*sp,cy*sp,cp),nz=dot(q.nx,q.ny,q.nz,sy*cp,-cy*cp,sp),shade=.62f+.36f*std::max(0.f,-.35f*nx+.45f*ny+.82f*nz),spec=.04f*std::pow(std::max(0.f,.22f*nx+.35f*ny+.91f*nz),32.f);if(glass)shade=.52f+.54f*std::abs(nz);
    p[i]={W*.5f+dot(q.x,q.y,z,cy,sy,0)*12.15f,H*.5f-dot(q.x,q.y,z,-sy*sp,cy*sp,cp)*12.15f,-dot(q.x,q.y,z,sy*cp,-cy*cp,sp),q.r*shade+spec,q.g*shade+spec,q.b*shade+spec,q.R*shade+spec,q.G*shade+spec,q.B*shade+spec};}
   std::vector<uint32_t>order(nf);std::iota(order.begin(),order.end(),0);if(glass)std::sort(order.begin(),order.end(),[&](auto a,auto b){return p[f[3*a]].z+p[f[3*a+1]].z+p[f[3*a+2]].z>p[f[3*b]].z+p[f[3*b+1]].z+p[f[3*b+2]].z;});for(auto j:order)triangle(plates[view],p[f[3*j]],p[f[3*j+1]],p[f[3*j+2]],glass);
  }if(!glass)faces+=nf;
 }
 std::array<std::string,3>names={"front","oblique","reverse"};for(int i=0;i<3;i++)for(int k=0;k<2;k++){std::ofstream out(std::string(argv[1])+"/"+(k?"wash-":"spectrum-")+names[i]+".rgba",std::ios::binary);auto&b=k?plates[i].b:plates[i].a;out.write((const char*)b.data(),b.size());}std::cerr<<"Source faces rendered per camera: "<<faces<<"\n";return faces==74293846?0:4;}
