import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import { subscribe } from "diagnostics_channel";
import mongoose, { mongo } from "mongoose";

const registerUser = asyncHandler(async (req, res) => {
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
  const { fullname, email, username, password } = req.body;
  console.log("FullName", fullname);

  //2. validation - not empty
  if (
    [fullname, username, email, password].some((field) => {
      field?.trim() === "";
    })
  ) {
    throw new ApiError(400, "All fields are required.");
  }

  //3. check if user is already exist
  const existingUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existingUser) {
    throw new ApiError(409, "User with email or username already exist.");
  }

  //4. check for images , check for avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required 1.");
  }

  //5 upload them to cloudinary , avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is required 2.");
  }

  //6. create user object -- create entry in db
  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //7. remove password and refresh token field from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  //8. check for user creation
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user.");
  }

  //9. return res
  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully."));
});

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh token."
    );
  }
};

const loginUser = asyncHandler(async (req, res) => {
  //1. req body -> data
  //2. username or email
  //3. find the user
  //4. password check
  //5. access and refresh token
  //6. send cookie
  //7. send res

  //1. req body -> data
  const { email, username, password } = req.body;

  //2. username or email
  if (!username && !email) {
    throw new ApiError(400, "Username or Email required.");
  }
  //3. find the user
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  // check user
  if (!user) {
    throw new ApiError(404, "User does not Exist.");
  }

  //4. password check
  const isPasswordValid = await user.isPasswordCorrect(password);

  // check
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials.");
  }
  //5. access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // optional
  const loggedInUser = await User.findOne(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in Successfully"
      )
    );
});

const logOutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );
  const options = {
    httpOnly: true,
    secure: true,
  };
  return res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json(new ApiResponse(200, {}, "User logged Out."));
});

const refreshAccessToken = asyncHandler(
  asyncHandler(async (req, res) => {
    const inComingAccessToken =
      req.cookies.refreshToken || req.body.refreshToken;
    if (!inComingAccessToken) {
      throw new ApiError(401, "Unauthorized Access.");
    }

    try {
      const decodedToken = jwt.verify(
        inComingAccessToken,
        process.env.REFRESH_TOKEN_SECRET
      );

      const user = await User.findById(decodedToken?._id);

      if (!user) {
        throw new ApiError(401, "Invalid refresh token.");
      }

      if (inComingAccessToken !== user?.refreshToken) {
        throw new ApiError(401, "Refresh token is expired or used.");
      }

      const options = {
        httpOnly: true,
        secure: true,
      };

      const { accessToken, newRefreshToken } =
        await generateAccessAndRefreshToken(user._id);

      return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
          new ApiResponse(
            200,
            { accessToken, refreshToken: newRefreshToken },
            "Access token refreshed successfully."
          )
        );
    } catch (error) {
      throw new ApiError(401, "Invalid refresh token.");
    }
  })
);

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid Old password.");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, "Password Changed Successfully."));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(200, req.user, "Current user fetched successfully.");
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "All fields are required.");
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullname: fullname,
        email: email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully."));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing.");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on Avatar.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar Image updated successfully."));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image file is missing.");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on coverImage");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image updated successfully."));
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "Username is missing.");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
       $addFields: {
          subscribersCount: {
              $size: "$subscribers"
          },
          channelSubscriberToCount: {
            $size: "$subscribedTo"
          },
          isSubscribed: {
            $cond: {
               if: { $in: [req.user?._id, "$subscribers.subscriber"] },
               then: true,
               else: false
            }
          }
       }
    },
    {
      $project: {
           fullname: 1,
           username: 1,
           subscribersCount: 1,
           channelSubscriberToCount: 1,
           isSubscribed: 1,
           avatar: 1,
           coverImage: 1,
           email: 1
      }
    }
  ]);
   
   if(!channel?.length){
         throw new ApiError(404,"Channel does not exist.")
   }

   return res
   .status(200)
   .json(
      new ApiResponse(200,channel[0],"User channel fetched successfully.")
   )

});


const getWatchHistory = asyncHandler(async(req,res) =>{
    const user = await User.aggregate([
        {
           $match: {
              _id: new mongoose.Types.ObjectId(req.user._id)
           }
        },
        {
          $lookup : {
            from: "videos",
            localField: "watchHistory",
            foreignField: "_id",
            as: "watchHistory",
            pipeline: [
              {
                $lookup: {
                  form: "users",
                  localField: "owner",
                  foreignField: "_id",
                  as: "owner",
                  pipeline: [
                    {
                      $project: {
                          fullname: 1,
                          username: 1,
                          avatar: 1
                      }
                    }
                  ]
                }
              },
              {
                $addFields: {
                    owner: {
                        $first: "$owner"
                    }
                }
              }
            ]
          }

        }
    ])

    return res
    .status(200)
    .json(new ApiResponse(200,user[0].watchHistory,"Watch history fetched."))
})


export {
  registerUser,
  loginUser,
  logOutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
