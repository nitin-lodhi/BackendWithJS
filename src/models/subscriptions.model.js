import mongoose,
{ Schema } from "mongoose";

const subscriptionSchema = new Schema({
    subscriber: {
       types : Schema.Types.ObjectId, // one who is subscribing
       ref: "User"
    },
    channel: {
         types : Schema.Types.ObjectId,  // one to whom 'subscriber' is subscribing
         ref: "User"
    }
})

export const Subscription = mongoose.model("Subscription",subscriptionSchema)