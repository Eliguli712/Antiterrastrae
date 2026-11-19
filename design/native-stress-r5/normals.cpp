#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <cmath>
#include <iostream>
#include <string>
int main(int c,char**v){if(c!=2)return 1;std::string p=v[1];const size_t NV=37951699,NF=74293846;int a=open((p+"/vertices.f32").c_str(),O_RDONLY),b=open((p+"/triangles.u32").c_str(),O_RDONLY),d=open((p+"/normals.f32").c_str(),O_CREAT|O_RDWR|O_TRUNC,0600);ftruncate(d,NV*12);auto*x=(float*)mmap(0,NV*12,PROT_READ,MAP_SHARED,a,0);auto*f=(unsigned*)mmap(0,NF*12,PROT_READ,MAP_SHARED,b,0);auto*n=(float*)mmap(0,NV*12,PROT_READ|PROT_WRITE,MAP_SHARED,d,0);for(size_t i=0;i<NF;i++){unsigned A=f[i*3],B=f[i*3+1],C=f[i*3+2];float e[3],g[3];for(int j=0;j<3;j++){e[j]=x[3*B+j]-x[3*A+j];g[j]=x[3*C+j]-x[3*A+j];}float q[3]={e[1]*g[2]-e[2]*g[1],e[2]*g[0]-e[0]*g[2],e[0]*g[1]-e[1]*g[0]};for(int j=0;j<3;j++){n[3*A+j]+=q[j];n[3*B+j]+=q[j];n[3*C+j]+=q[j];}}
for(size_t i=0;i<NV;i++){double l=sqrt(double(n[3*i])*n[3*i]+double(n[3*i+1])*n[3*i+1]+double(n[3*i+2])*n[3*i+2]);if(l>0)for(int j=0;j<3;j++)n[3*i+j]/=l;}msync(n,NV*12,MS_SYNC);std::cerr<<"Area-weighted native normals "<<NV<<" vertices\n";}
