#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
constexpr uint64_t NV=37951699,NF=74293846;
struct Map {int fd=-1;void* p=nullptr;size_t size=0;Map(std::string n){fd=open(n.c_str(),O_RDONLY);if(fd<0)throw std::runtime_error("Cannot open "+n);struct stat s;fstat(fd,&s);size=s.st_size;p=mmap(nullptr,size,PROT_READ,MAP_PRIVATE,fd,0);if(p==MAP_FAILED)throw std::runtime_error("Cannot map "+n);}~Map(){if(p&&p!=MAP_FAILED)munmap(p,size);if(fd>=0)close(fd);}};
struct Buffer{std::string s;Buffer(){s.reserve(8<<20);}void flush(){std::cout.write(s.data(),s.size());s.clear();}void text(const char*p){s.append(p);}void integer(uint64_t n){char b[32];auto r=std::to_chars(b,b+32,n);s.append(b,r.ptr);}void real(double n){char b[48];auto r=std::to_chars(b,b+48,n,std::chars_format::general,12);s.append(b,r.ptr);}void maybe(){if(s.size()>(4<<20))flush();}~Buffer(){flush();}};
std::array<double,12> transform(int argc,char**argv,int start){if(argc<start+12)throw std::runtime_error("Missing transform");std::array<double,12>a;for(int i=0;i<12;i++)a[i]=std::stod(argv[start+i]);return a;}
std::array<double,3> xyz(const double*v,uint32_t id,const std::array<double,12>&m){const double*p=v+3ull*id;std::array<double,3> q;for(int a=0;a<3;a++)q[a]=m[a*3]*p[0]+m[a*3+1]*p[1]+m[a*3+2]*p[2]+m[9+a];return q;}
int parse(std::string cache){
 bool wf64=!std::filesystem::exists(cache+"/vertices.f64"),wf32=!std::filesystem::exists(cache+"/vertices.f32"),wfaces=!std::filesystem::exists(cache+"/triangles.u32");
 std::ofstream v64,v32,faces;if(wf64)v64.open(cache+"/vertices.f64",std::ios::binary);if(wf32)v32.open(cache+"/vertices.f32",std::ios::binary);if(wfaces)faces.open(cache+"/triangles.u32",std::ios::binary);
 std::string s;std::vector<char>buf(8<<20);uint64_t nv=0,nf=0;
 while(std::cin){std::cin.read(buf.data(),buf.size());s.append(buf.data(),std::cin.gcount());size_t end=s.rfind('>');if(end==std::string::npos)continue;std::string b=s.substr(0,end+1);s.erase(0,end+1);char*p=b.data();while((p=strchr(p,'<'))){
  if(strncmp(p,"<vertex ",8)==0){char*e=p;double q[3];float r[3];for(int i=0;i<3;i++){e=strchr(e,'"')+1;q[i]=strtod(e,&e);r[i]=q[i];e++;}if(wf64)v64.write((char*)q,24);if(wf32)v32.write((char*)r,12);nv++;}
  else if(strncmp(p,"<triangle ",10)==0){char*e=p;uint32_t q[3];for(int i=0;i<3;i++){e=strchr(e,'"')+1;q[i]=strtoul(e,&e,10);e++;}if(wfaces)faces.write((char*)q,12);nf++;}p++;
 }}
 std::cerr<<"PARSED "<<nv<<" vertices "<<nf<<" triangles\n";return(nv==NV&&nf==NF)?0:3;
}
int main(int argc,char**argv){try{
 if(argc<3)return 2;std::string mode=argv[1],cache=argv[2];if(mode=="parse")return parse(cache);
 Map vm(cache+"/vertices.f64"),fm(cache+"/triangles.u32");if(vm.size!=NV*24||fm.size!=NF*12)throw std::runtime_error("Source array size mismatch");
 const double*v=(double*)vm.p;const uint32_t*f=(uint32_t*)fm.p;
 if(mode=="faces3mf"||mode=="verify3mf"){
  if(argc<4)return 2;Map cm(cache+"/"+std::string(argv[3])+"mm-colour-index.u16");const uint16_t*c=(uint16_t*)cm.p;if(cm.size!=NV*2)throw std::runtime_error("Colour count mismatch");
  if(mode=="faces3mf"){Buffer o;for(uint64_t i=0;i<NF;i++){const uint32_t*a=f+3*i;o.text("<triangle v1=\"");o.integer(a[0]);o.text("\" v2=\"");o.integer(a[1]);o.text("\" v3=\"");o.integer(a[2]);o.text("\" pid=\"2\" p1=\"");o.integer(c[a[0]]);o.text("\" p2=\"");o.integer(c[a[1]]);o.text("\" p3=\"");o.integer(c[a[2]]);o.text("\"/>");o.maybe();}return 0;}
  std::string s;std::vector<char>b(8<<20);uint64_t count=0;while(std::cin){std::cin.read(b.data(),b.size());s.append(b.data(),std::cin.gcount());auto cut=s.rfind('>');if(cut==std::string::npos)continue;std::string block=s.substr(0,cut+1);s.erase(0,cut+1);char*p=block.data();while((p=strstr(p,"<triangle "))){if(count>=NF)throw std::runtime_error("Too many faces");char*e=p;uint32_t q[7];for(int k=0;k<7;k++){e=strchr(e,'"')+1;q[k]=strtoul(e,&e,10);e++;}const uint32_t*a=f+3*count;if(q[0]!=a[0]||q[1]!=a[1]||q[2]!=a[2]||q[3]!=2||q[4]!=c[a[0]]||q[5]!=c[a[1]]||q[6]!=c[a[2]])throw std::runtime_error("3MF face/property mismatch at "+std::to_string(count));count++;p++;}}
  std::cerr<<"VERIFIED 3MF "<<count<<" ordered faces and colour properties\n";return count==NF?0:4;
 }
 if(mode=="stl"||mode=="obj"||mode=="verifyobj"){
  if(argc<16)return 2;std::string size=argv[3];auto m=transform(argc,argv,4);
  if(mode=="stl"){
   std::array<char,80>header{};std::string name="Otodus megalodon native74 "+size+"mm; units=mm; all source faces";memcpy(header.data(),name.c_str(),std::min(name.size(),header.size()));std::cout.write(header.data(),80);uint32_t nf=NF;std::cout.write((char*)&nf,4);
   std::vector<char>b;b.reserve(4<<20);for(uint64_t i=0;i<NF;i++){auto a=xyz(v,f[3*i],m),d=xyz(v,f[3*i+1],m),e=xyz(v,f[3*i+2],m);double x=d[0]-a[0],y=d[1]-a[1],z=d[2]-a[2],X=e[0]-a[0],Y=e[1]-a[1],Z=e[2]-a[2];double nx=y*Z-z*Y,ny=z*X-x*Z,nz=x*Y-y*X,L=sqrt(nx*nx+ny*ny+nz*nz);float rec[12]={(float)(L?nx/L:0),(float)(L?ny/L:0),(float)(L?nz/L:0),(float)a[0],(float)a[1],(float)a[2],(float)d[0],(float)d[1],(float)d[2],(float)e[0],(float)e[1],(float)e[2]};const char*p=(char*)rec;b.insert(b.end(),p,p+48);b.push_back(0);b.push_back(0);if(b.size()>(4<<20)){std::cout.write(b.data(),b.size());b.clear();}}std::cout.write(b.data(),b.size());return 0;
  }
  if(mode=="obj"){
   Map sm(cache+"/"+size+"mm-values.f32");const float*ss=(float*)sm.p;Buffer o;o.text("# Otodus megalodon native CT; all37,951,699 vertices and74,293,846 faces\n# Units: millimetres. Colours are independent FEM projection; see properties.json.\nmtllib tooth.mtl\no Otodus_megalodon\n");
   for(uint64_t i=0;i<NV;i++){auto q=xyz(v,i,m);o.text("v ");o.real(q[0]);o.text(" ");o.real(q[1]);o.text(" ");o.real(q[2]);o.text("\n");o.maybe();}
   int last=-1;const double lo=253167.0947190341,hi=250522132.64670932,den=log(hi)-log(lo);
   for(uint64_t i=0;i<NF;i++){const uint32_t*a=f+3*i;double x=ss[a[0]],y=ss[a[1]],z=ss[a[2]];int ci=256;if(std::isfinite(x)&&std::isfinite(y)&&std::isfinite(z)){double u=(log(std::max((x+y+z)/3,lo))-log(lo))/den;ci=std::clamp((int)std::lround(std::clamp(u,0.,1.)*255),0,255);}if(ci!=last){o.text("usemtl stress_");o.integer(ci);o.text("\n");last=ci;}o.text("f ");o.integer((uint64_t)a[0]+1);o.text(" ");o.integer((uint64_t)a[1]+1);o.text(" ");o.integer((uint64_t)a[2]+1);o.text("\n");o.maybe();}return 0;
  }
  std::string s;std::vector<char>b(8<<20);uint64_t nv=0,nf=0;double maxerr=0;std::array<double,3>lo={1e30,1e30,1e30},hi={-1e30,-1e30,-1e30};
  while(std::cin){std::cin.read(b.data(),b.size());s.append(b.data(),std::cin.gcount());size_t cut=s.rfind('\n');if(cut==std::string::npos)continue;std::string block=s.substr(0,cut+1);s.erase(0,cut+1);char*p=block.data();while(p&&*p){char*next=strchr(p,'\n');if(next){*next=0;next++;}if(p[0]=='v'&&p[1]==' '){if(nv>=NV)throw std::runtime_error("Too many OBJ vertices");char*e=p+2;auto q=xyz(v,nv,m);for(int k=0;k<3;k++){double a=strtod(e,&e);lo[k]=std::min(lo[k],a);hi[k]=std::max(hi[k],a);maxerr=std::max(maxerr,std::abs(a-q[k]));}nv++;}else if(p[0]=='f'&&p[1]==' '){if(nf>=NF)throw std::runtime_error("Too many OBJ faces");char*e=p+2;for(int k=0;k<3;k++){uint64_t a=strtoull(e,&e,10);if(a!=(uint64_t)f[3*nf+k]+1)throw std::runtime_error("OBJ face indices differ");}nf++;}p=next;}}
  std::cerr<<"VERIFIED OBJ "<<nv<<" vertices "<<nf<<" faces; max coordinate error="<<maxerr<<"mm\n";std::cout<<"{\"vertices\":"<<nv<<",\"triangles\":"<<nf<<",\"coordinate_max_absolute_error_mm\":"<<maxerr<<",\"bounds_mm\":[["<<lo[0]<<","<<lo[1]<<","<<lo[2]<<"],["<<hi[0]<<","<<hi[1]<<","<<hi[2]<<"]]}\n";
  return(nv==NV&&nf==NF&&maxerr<1e-7)?0:5;
 }
 throw std::runtime_error("Unknown mode");
}catch(std::exception&e){std::cerr<<e.what()<<"\n";return 10;}}
