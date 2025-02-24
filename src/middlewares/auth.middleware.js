import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js"
import jwt from "jsonwebtoken";


export const verifyJWT = asyncHandler(async(req, _,next)=>{
   try {
      const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
      console.log("Extracted Token:", token);
      if(!token){
       throw new ApiError(401,"Unauthorized Token.")
      }
   
      const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
   
      const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

      console.log("User :",user);
   
      if(!user){
         throw new ApiError(401,"User not found by given token.")
      }
      
      req.user = user
      next()
   } catch (error) {
      throw new ApiError(401,"Error while Verifying access token.")
   }
})