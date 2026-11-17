/* CPU-only validation of the actual recorded Float32 reference operands. */
#include <float.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE *file=fopen(argv[1],"rb");if(!file)return 3;
 float row[4];unsigned long count=0,failed=0;double maximum=0;
 while(fread(row,sizeof(float),4,file)==4){
  float actual=fmaf(row[0],row[1],row[2]);uint32_t a,b;
  memcpy(&a,&actual,sizeof(a));memcpy(&b,&row[3],sizeof(b));
  if(a!=b){failed++;double error=fabs((double)actual-row[3]);if(error>maximum)maximum=error;}
  count++;
 }
 fclose(file);
 printf("{\"cpuOnly\":true,\"operation\":\"native C fmaf\",\"floatEvalMethod\":%d,\"triples\":%lu,\"bitMismatches\":%lu,\"maximumAbsoluteDifference\":%.17g,\"passed\":%s}\n",FLT_EVAL_METHOD,count,failed,maximum,failed?"false":"true");
 return failed?1:0;
}
