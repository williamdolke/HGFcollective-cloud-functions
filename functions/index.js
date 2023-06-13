const functions = require("firebase-functions");
// Firebase Admin SDK is required to access Firebase Store
const admin = require("firebase-admin");
// If you are getting errors regarding initializeApp and credentials, try updating libraries:
// npm i -g firebase-tools@latest
// npm i firebase-functions@latest
// npm i firebase-admin@latest
admin.initializeApp();

// Listen for new messages in the database and sends a push notification to a user or admin
exports.sendPushNotifications = functions.region('europe-west2').firestore.document('/users/{userID}/messages/{messageID}')
  .onCreate((snapshot, context) => {
    const userID = context.params.userID;
    const messageID = context.params.messageID;

    console.log('Found new message in collection for user: ' + userID + ', with message: ' + messageID);

    // Read the users document to get the message content
    return admin.firestore().doc('/users/' + userID).get().then(userSnapshot => {
      const user = userSnapshot.data();

      // Read the message document to find out who sent the message
      return admin.firestore().doc('/users/' + user.id + '/messages/' + messageID).get().then(messageSnapshot => {
        const message = messageSnapshot.data();
        const messageContent = (message.type == 'image') ? "Image attachment" : user.messagePreview

        // Define the notification contents. 
        // 'click_action' corresponds to 'category' in the APNs payload and is used by the client receiving the
        // notification in order to clear notifications from notification center when messages are set as read.
        const title = message.isCustomer ? (user.preferredName ? user.preferredName : user.sender.slice(0, 12)) + " sent you a message" : "HGF Collective sent you a message";
        const imageURL = (message.type == "image") ? message.content : ""
        const payload = {
          notification: {
            title: title,
            body: messageContent,
            image: imageURL,
            click_action: user.id,
            sound: "default"
          }
        };

        if (message.isCustomer == true) {
          // Get the fcmToken of the admins and send them the notification
          return admin.firestore().doc('/admin/fcmToken').get().then(adminSnapshot => {
            // Read the fcmToken document to get the admin tokens
            const administrators = adminSnapshot.data();
            const tokenDict = administrators.token;

            for (const adminUID in tokenDict) {
              if (tokenDict.hasOwnProperty(adminUID)) {
                console.log("Sending notification to: ", adminUID);

                // Send the notification to the recipient
                const recipientFCMtoken = tokenDict[adminUID];
                return admin.messaging().sendToDevice(recipientFCMtoken, payload);
              }
            }
          })
        } else if (message.isCustomer == false) {
          // Get the fcmToken of the customer and send them the nofitication
          const recipientFCMtoken = user.fcmToken;

          // Send the notification to the recipient
          return admin.messaging().sendToDevice(recipientFCMtoken, payload);
        }
      })
    }).then(response => {
      console.log("Successfully sent message:", response);
    }).catch(function(error) {
      console.log("Error sending message:", error);
    });
  });
