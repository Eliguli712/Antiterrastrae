#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <vector>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
constexpr uint64_t NV=37951699,NF=74293846;constexpr int W=1920,H=1080;
const double R[9]={.3916250209003652,-1.8896005868512973,-.1643222107322461,-1.8936263969740943,-.37991608089014606,-.1442399526063988,.10849532456107326,.18983075993161974,-1.9243584309831898},T[3]={35.49153583794037,35.69259136159072,182.60196213035087},C[3]={13.77625938259632,19.674474161580527,28.548583526575094};
const double AX[3][3]={{-.057078421241341264,-.09418775987466738,.9939168575481491},{-.2016547068614822,.9761082946778717,.08091956661813175},{-.9777921215827041,-.19580925144346106,-.07470812552825656}};
struct V{float x,y,z,q;};struct F{uint32_t i;float z;uint8_t c;};
void* mapping(const char*p,size_t n){int fd=open(p,O_RDONLY);if(fd<0)exit(2);void*m=mmap(nullptr,n,PROT_READ,MAP_PRIVATE,fd,0);close(fd);if(m==MAP_FAILED)exit(3);return m;}
int main(int argc,char**argv){if(argc!=5)return 1;const int axis=atoi(argv[3]),N=atoi(argv[4]);if(axis<0||axis>2||N<2)return 2;auto vs=(const double*)mapping(argv[1],NV*24);auto fs=(const uint32_t*)mapping(argv[2],NF*12);std::vector<V>p(NV);float lo=1e30f,hi=-1e30f;const double yaw=3.141592653589793-.49,pitch=.20,sy=sin(yaw),cy=cos(yaw),sp=sin(pitch),cp=cos(pitch),PPM=14.70;
 for(uint64_t i=0;i<NV;i++){const double*x=vs+i*3;double d[3];for(int j=0;j<3;j++)d[j]=(R[3*j]*x[0]+R[3*j+1]*x[1]+R[3*j+2]*x[2]+T[j]-(j==2?136.73910524340096:0))*.5;double q=0;for(int j=0;j<3;j++)q+=(x[j]-C[j])*AX[axis][j];p[i]={(float)(755+(d[0]*cy+d[1]*sy)*PPM),(float)(530-(-d[0]*sy*sp+d[1]*cy*sp+d[2]*cp)*PPM),(float)(-(d[0]*sy*cp-d[1]*cy*cp+d[2]*sp)),(float)q};lo=std::min(lo,(float)q);hi=std::max(hi,(float)q);}
 lo-=.018f;hi+=.018f;std::vector<std::vector<F>>bins(N);uint64_t samples=0;
 for(uint64_t j=0;j<NF;j++){const V&a=p[fs[3*j]],&b=p[fs[3*j+1]],&c=p[fs[3*j+2]];float area=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);if(std::abs(area)<1e-9f)continue;int x0=std::max(0,(int)floor(std::min({a.x,b.x,c.x}))),x1=std::min(W-1,(int)floor(std::max({a.x,b.x,c.x}))),y0=std::max(0,(int)floor(std::min({a.y,b.y,c.y}))),y1=std::min(H-1,(int)floor(std::max({a.y,b.y,c.y})));float ux=(b.x-a.x)/PPM,uy=-(b.y-a.y)/PPM,uz=b.z-a.z,vx=(c.x-a.x)/PPM,vy=-(c.y-a.y)/PPM,vz=c.z-a.z,nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,norm=sqrt(nx*nx+ny*ny+nz*nz);float lam=norm>0?fabs((-.35f*nx+.45f*ny+.82f*nz)/norm):.5f;uint8_t shade=(uint8_t)std::clamp(218.f+26.f*lam,0.f,255.f);
  for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){float u=((b.x-x-.5f)*(c.y-y-.5f)-(b.y-y-.5f)*(c.x-x-.5f))/area,v=((c.x-x-.5f)*(a.y-y-.5f)-(c.y-y-.5f)*(a.x-x-.5f))/area,w=1-u-v;if(std::min({u,v,w})<-.000001f)continue;float q=u*a.q+v*b.q+w*c.q,z=u*a.z+v*b.z+w*c.z;int frame=std::clamp((int)ceil((q-lo)/(hi-lo)*(N-1)),0,N-1);bins[frame].push_back({(uint32_t)(y*W+x),z,shade});samples++;}
  if(j%20000000==0)std::cerr<<"PCA "<<axis+1<<" native faces rasterized "<<j<<" / "<<NF<<"\n";
 }
 std::vector<uint8_t>im(W*H*3);std::vector<float>depth(W*H,1e30f);for(int y=0;y<H;y++)for(int x=0;x<W;x++){float r=sqrt(pow((x-800.f)/1500,2)+pow((y-500.f)/1200,2)),t=std::clamp(1-r,0.f,1.f);int i=(y*W+x)*3;im[i]=(uint8_t)(7+13*t);im[i+1]=(uint8_t)(20+24*t);im[i+2]=(uint8_t)(28+27*t);}
 for(int frame=0;frame<N;frame++){for(const F&f:bins[frame])if(f.z<depth[f.i]){depth[f.i]=f.z;im[3*f.i]=f.c;im[3*f.i+1]=std::min(255,(int)f.c+3);im[3*f.i+2]=std::max(0,(int)f.c-1);}std::cout.write((char*)im.data(),im.size());if(!std::cout)return 4;}
 std::cerr<<"AUDIT source_faces="<<NF<<" vertices="<<NV<<" raster_fragments="<<samples<<" PCA="<<axis+1<<" frames="<<N<<" lo="<<lo<<" hi="<<hi<<"\n";return 0;
}
