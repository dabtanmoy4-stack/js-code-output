// api/create-template-order.js
export default async function handler(req,res){
 if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
 try{
  if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET) throw new Error("Razorpay environment variables are missing.");
  const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  const auth=req.headers.authorization||"";
  if(!auth.startsWith("Bearer ")) return res.status(401).json({error:"Google sign-in required."});
  const order=await fetch("https://api.razorpay.com/v1/orders",{
   method:"POST",
   headers:{
    "Authorization":"Basic "+Buffer.from(process.env.RAZORPAY_KEY_ID+":"+process.env.RAZORPAY_KEY_SECRET).toString("base64"),
    "Content-Type":"application/json"
   },
   body:JSON.stringify({amount:300,currency:"INR",receipt:"template_"+Date.now(),notes:{template_name:String(body.name||"").slice(0,80)}})
  });
  const data=await order.json();
  if(!order.ok) return res.status(order.status).json({error:data?.error?.description||"Razorpay order creation failed."});
  return res.status(200).json({orderId:data.id,keyId:process.env.RAZORPAY_KEY_ID});
 }catch(e){return res.status(500).json({error:e.message||"Server error."})}
}