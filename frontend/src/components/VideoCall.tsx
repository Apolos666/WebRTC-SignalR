"use client";

import { useEffect, useRef, useState } from "react";
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";
import Peer from "simple-peer";

interface VideoCallProps {
  roomId: string;
}

const VideoCall = ({ roomId }: VideoCallProps) => {
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [connectionStatus, setConnectionStatus] =
    useState<string>("Disconnected");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Record<string, Peer.Instance>>({});

  // Thêm một object để theo dõi trạng thái initiator
  const initiatorStatusRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    console.log("Initializing SignalR connection...");
    const newConnection = new HubConnectionBuilder()
      .withUrl("http://localhost:5270/videocallhub")
      .withAutomaticReconnect()
      .build();

    // Thêm các event handlers cho connection state
    newConnection.onreconnecting((error) => {
      console.log("Attempting to reconnect:", error);
      setConnectionStatus("Reconnecting...");
    });

    newConnection.onreconnected((connectionId) => {
      console.log("Reconnected with ID:", connectionId);
      setConnectionStatus("Connected");
    });

    newConnection.onclose((error) => {
      console.log("Connection closed:", error);
      setConnectionStatus("Disconnected");
    });

    setConnection(newConnection);

    console.log("Requesting media devices...");
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        console.log("Media stream obtained successfully");
        setStream(mediaStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }
      })
      .catch((error) => {
        console.error("Error accessing media devices:", error);
        setConnectionStatus("Media Device Error");
      });

    return () => {
      console.log("Cleaning up resources...");
      if (stream) {
        console.log("Stopping all tracks");
        stream.getTracks().forEach((track) => {
          track.stop();
          console.log(`Track ${track.kind} stopped`);
        });
      }

      if (Object.keys(peersRef.current).length > 0) {
        console.log("Destroying all peer connections");
        Object.entries(peersRef.current).forEach(([userId, peer]) => {
          console.log(`Destroying peer connection for user: ${userId}`);
          peer.destroy();
        });
      }

      if (connection) {
        console.log("Stopping SignalR connection");
        connection.stop().catch((err) => {
          console.error("Error stopping connection:", err);
        });
      }
    };
  }, []);

  const createPeer = (
    userId: string,
    stream: MediaStream,
    isInitiator: boolean
  ): Peer.Instance => {
    console.log("Creating new peer for:", userId, "isInitiator:", isInitiator);

    // Lưu trạng thái initiator
    initiatorStatusRef.current[userId] = isInitiator;

    const peer = new Peer({
      initiator: isInitiator,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
    });

    peer.on("signal", (signal) => {
      console.log("Signaling:", userId, signal.type);
      if (connection) {
        connection.invoke("SendSignal", JSON.stringify(signal), roomId, userId);
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log("Received stream from:", userId);
      setRemoteStreams((prev) => ({
        ...prev,
        [userId]: remoteStream,
      }));
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      removePeer(userId);
    });

    peer.on("close", () => {
      console.log("Peer closed:", userId);
      removePeer(userId);
    });

    peersRef.current[userId] = peer;
    return peer;
  };

  const removePeer = (userId: string) => {
    console.log("Removing peer:", userId);
    if (peersRef.current[userId]) {
      peersRef.current[userId].destroy();
      delete peersRef.current[userId];
      delete initiatorStatusRef.current[userId];
      setRemoteStreams((prev) => {
        const newStreams = { ...prev };
        delete newStreams[userId];
        return newStreams;
      });
    }
  };

  useEffect(() => {
    if (!connection || !stream) return;

    console.log("Starting SignalR connection...");
    connection
      .start()
      .then(() => {
        console.log("SignalR Connected successfully");
        setConnectionStatus("Connected");
        console.log(`Joining room: ${roomId}`);
        return connection.invoke("JoinRoom", roomId);
      })
      .then(() => {
        console.log(`Successfully joined room: ${roomId}`);
      })
      .catch((err) => {
        console.error("SignalR Connection error:", err);
        setConnectionStatus("Connection Error");
      });

    const handleUserConnected = (userId: string) => {
      console.log("User connected:", userId);
      if (!peersRef.current[userId]) {
        createPeer(userId, stream, true);
      }
    };

    const handleReceiveSignal = (signal: string, userId: string) => {
      try {
        console.log("Received signal from:", userId);
        const signalData = JSON.parse(signal);

        let peer = peersRef.current[userId];

        if (!peer) {
          peer = createPeer(userId, stream, false);
        }

        // Sử dụng initiatorStatusRef thay vì peer.initiator
        if (
          signalData.type === "offer" &&
          !initiatorStatusRef.current[userId]
        ) {
          peer.signal(signalData);
        } else if (
          signalData.type === "answer" &&
          initiatorStatusRef.current[userId]
        ) {
          peer.signal(signalData);
        } else if (signalData.type === "candidate") {
          peer.signal(signalData);
        }
      } catch (err) {
        console.error("Error handling signal:", err);
        removePeer(userId);
      }
    };

    const handleUserDisconnected = (userId: string) => {
      console.log("User disconnected:", userId);
      removePeer(userId);
    };

    connection.on("userConnected", handleUserConnected);
    connection.on("receiveSignal", handleReceiveSignal);
    connection.on("userDisconnected", handleUserDisconnected);

    return () => {
      connection.off("userConnected", handleUserConnected);
      connection.off("receiveSignal", handleReceiveSignal);
      connection.off("userDisconnected", handleUserDisconnected);
    };
  }, [connection, stream, roomId]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <div
          className={`p-2 rounded mb-4 text-center ${
            connectionStatus === "Connected"
              ? "bg-green-100 text-green-800"
              : connectionStatus === "Disconnected"
              ? "bg-red-100 text-red-800"
              : connectionStatus === "Reconnecting..."
              ? "bg-yellow-100 text-yellow-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          Connection Status: {connectionStatus}
        </div>
      </div>
      <div>
        <h2 className="text-xl mb-2">Local Stream</h2>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full bg-black rounded-lg"
        />
      </div>
      <div>
        <h2 className="text-xl mb-2">
          Remote Streams ({Object.keys(remoteStreams).length})
        </h2>
        <div className="grid gap-4">
          {Object.entries(remoteStreams).map(([userId, remoteStream]) => (
            <div key={userId}>
              <video
                autoPlay
                playsInline
                className="w-full bg-black rounded-lg"
                ref={(element) => {
                  if (element) element.srcObject = remoteStream;
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VideoCall;
