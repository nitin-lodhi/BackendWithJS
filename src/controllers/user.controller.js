import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { log } from "console";

const registerUser = asyncHandler(async (req,res)=>{
     // get user details from frontend
     // validation - not empty
     // check if user is already exist
     // check for images , check for avatar
     // upload them to cloudinary , avatar
     // create user object -- create entry in db
     // remove password and refresh token field from response
     // check for user creation
     // return res
    
    //1. get user details from frontend
    const {fullname,email,username,password} = req.body
    console.log("FullName",fullname);
    
     //2. validation - not empty
    if([fullname,username,email,password].some( (field) => { field?.trim() === "" })){
         throw new ApiError(400,"All fields are required.")
    }

     //3. check if user is already exist
    const existingUser = await User.findOne({
          $or: [{username},{email}]
     })

     if(existingUser){
        throw new ApiError(409,"User with email or username already exist.")
     }
    
     //4. check for images , check for avatar
    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;

    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0
    ){
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required 1.")
    }
    
    //5 upload them to cloudinary , avatar
   const avatar =  await uploadOnCloudinary(avatarLocalPath)
   const coverImage = await uploadOnCloudinary(coverImageLocalPath)

   
   if(!avatar){
     throw new ApiError(400,"Avatar is required 2.")
   }
    
    //6. create user object -- create entry in db
   const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
   
   //7. remove password and refresh token field from response
   const createdUser = await User.findById(user._id).select(
     "-password -refreshToken"
   )
    
    //8. check for user creation
   if(!createdUser){
     throw new ApiError(500,"Something went wrong while registering the user.")
   }

    //9. return res
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully.")
    )
    
})

export {registerUser}