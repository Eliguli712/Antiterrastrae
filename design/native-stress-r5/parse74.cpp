#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <array>
#include <cstring>
int main(int c,char**v){if(c!=2)return 2;std::ofstream vp(std::string(v[1])+"/vertices.f32",std::ios::binary),fp(std::string(v[1])+"/triangles.u32",std::ios::binary);std::string s;std::vector<char>b(8<<20);long nv=0,nf=0;while(std::cin){std::cin.read(b.data(),b.size());s.append(b.data(),std::cin.gcount());size_t last=s.rfind('>');if(last==std::string::npos)continue;std::string block=s.substr(0,last+1);s.erase(0,last+1);char*p=block.data();while((p=strchr(p,'<'))){if(strncmp(p,"<vertex ",8)==0){char *e=p;float q[3];for(int k=0;k<3;k++){e=strchr(e,'"')+1;q[k]=strtof(e,&e);e++;}vp.write((char*)q,12);nv++;}else if(strncmp(p,"<triangle ",10)==0){char*e=p;unsigned q[3];for(int k=0;k<3;k++){e=strchr(e,'"')+1;q[k]=strtoul(e,&e,10);e++;}fp.write((char*)q,12);nf++;}p++;}if(nf>0 && nf%1000000<50000)std::cerr<<nv<<" "<<nf<<"\n";}std::cerr<<"COMPLETE "<<nv<<" "<<nf<<"\n";return(nv==37951699&&nf==74293846)?0:3;}
