Shader "Archive/Starry Night" {
 Properties { _Zenith ("Zenith", Color) = (.007,.012,.029,1) _Horizon ("Horizon", Color) = (.029,.038,.068,1) }
 SubShader { Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" } Cull Off ZWrite Off
 Pass {
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct vary { float4 pos:SV_POSITION; float3 direction:TEXCOORD0; };
 half4 _Zenith, _Horizon;
 vary vert(appdata_base v){ vary o; o.pos=UnityObjectToClipPos(v.vertex); o.direction=v.vertex.xyz; return o; }
 float hash(float2 p){return frac(sin(dot(p,float2(127.1,311.7)))*43758.5453);}
 float4 frag(vary i):SV_Target{
   float3 d=normalize(i.direction);
   float2 grid=float2(atan2(d.z,d.x)/6.2831853+.5, asin(clamp(d.y,-1,1))/3.14159265+.5)*float2(720,360);
   float2 cell=floor(grid); float seed=hash(cell);
   float2 off=frac(grid)-(.18+.64*float2(hash(cell+19),hash(cell+31)));
   float radius=length(off); float pixel=max(.027,.5*length(fwidth(grid)));
   float star=(1.-smoothstep(.045,.045+pixel,radius))*step(.968,seed);
   float blink=.78+.22*sin(_Time.y*(1.1+seed)+6.28*hash(cell+2));
   float3 sky=lerp(_Horizon.rgb,_Zenith.rgb,saturate(abs(d.y)*2));
   return float4(sky+star*blink*lerp(float3(.52,.66,.88),float3(.96,.81,.57),hash(cell+3)),1);
 }
 ENDCG
 } } }
