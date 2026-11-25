Shader "Archive/Void Carapace"
{
 Properties { _Presence ("Presence",Range(0,1))=1 }
 SubShader {
 Tags { "Queue"="Transparent" "RenderType"="Transparent" } Blend SrcAlpha OneMinusSrcAlpha ZWrite Off
 Pass {
 CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 struct vary { float4 pos:SV_POSITION; float3 normal:TEXCOORD0; float3 world:TEXCOORD1; };
 float _Presence;
 vary vert(appdata_base v){vary o;o.pos=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);return o;}
 fixed4 frag(vary i):SV_Target {
 float3 n=normalize(i.normal);float rim=1-abs(dot(n,normalize(i.world-_WorldSpaceCameraPos)));
 float ridge=saturate(dot(n,normalize(float3(.3,.7,.52))));
 return float4(float3(.008,.012,.019)+float3(.063,.084,.122)*(.64*pow(rim,3)+.34*ridge*ridge),_Presence);
 }
 ENDCG
 } } }
