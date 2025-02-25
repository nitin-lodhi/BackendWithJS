import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

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

const generateAccessAndRefreshToken = async (userId)=> {
     try {
      const user =  await User.findById(userId) 
      const accessToken = user.generateAccessToken()
      const refreshToken = user.generateRefreshToken()

      user.refreshToken = refreshToken
      user.save({validateBeforeSave: false})
      return { accessToken , refreshToken }
     } catch (error) {
         throw new ApiError(500,"Something went wrong while generating access and refresh token.")  
     }
}

const loginUser = asyncHandler(async (req,res) =>{
       //1. req body -> data
       //2. username or email
       //3. find the user
       //4. password check
       //5. access and refresh token
       //6. send cookie
       //7. send res

        //1. req body -> data
        const { email, username, password } = req.body
        
        //2. username or email
        if (!username && !email){
          throw new ApiError(400,"Username or Email required.")
        }
        //3. find the user
         const user = await User.findOne({
               $or: [{username},{email}]
         })
        
         // check user
         if(!user){
          throw new ApiError(404,"User does not Exist.")
         }
         
        //4. password check
        const isPasswordValid =  await user.isPasswordCorrect(password)

        // check
        if(!isPasswordValid){
          throw new ApiError(401,"Invalid user credentials.")
        }
         //5. access and refresh token
       const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id)
      
       // optional
      const loggedInUser = await User.findOne(user._id).
      select("-password -refreshToken")
       
     const options = {
      httpOnly: true,
      secure: true
     }
     
     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", refreshToken, options)
     .json(
        new ApiResponse(
          200,
          {
            user: loggedInUser, accessToken,
            refreshToken
          },
          "User logged in Successfully"
        )
     )    
})

const logOutUser = asyncHandler(async(req,res) =>{
   await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
           refreshToken: undefined
        }
      },
      {
        new: true
      }
   )
   const options = {
    httpOnly: true,
    secure: true
   }
   return res
   .status(200)
   .clearCookie('accessToken')
   .clearCookie("refreshToken")
   .json(new ApiResponse(200,{},"User logged Out."))
})

const refreshAccessToken = asyncHandler(asyncHandler(async(req,res)=>{
    const inComingAccessToken = req.cookies.refreshToken || req.body.refreshToken
    if(!inComingAccessToken){
      throw new ApiError(401,"Unauthorized Access.")
    }

    try {
      const decodedToken = jwt.verify(inComingAccessToken,process.env.REFRESH_TOKEN_SECRET)
  
      const user = await User.findById(decodedToken?._id)
      
      if(!user){
        throw new ApiError(401,"Invalid refresh token.")
      }
  
      if(inComingAccessToken !== user?.refreshToken){
        throw new ApiError(401,"Refresh token is expired or used.")
      }
  
      const options = {
           httpOnly: true,
           secure: true
      }
      
     const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id)
  
     return res
     .status(200)
     .cookie("accessToken",accessToken, options)
     .cookie("refreshToken",newRefreshToken, options)
     .json(
      new ApiResponse(
          200,
          { accessToken,refreshToken:  newRefreshToken },
          "Access token refreshed successfully."
      )
     )
    } catch (error) {
        throw new ApiError(401, "Invalid refresh token.")
    }
   
}))

export { registerUser, loginUser, logOutUser,refreshAccessToken }