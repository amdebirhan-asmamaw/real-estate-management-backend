import request from "supertest";
import app from "../src/app";
import { User } from "../src/modules/auth/auth.model";
import { Notification } from "../src/modules/notifications/notification.model";

const PASSWORD = "Password123";
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const makeUser = async (email: string) => {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "Notify User", email, password: PASSWORD, role: "tenant" });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const user = await User.findOne({ email });
  return { token: login.body.data.tokens.accessToken as string, user: user! };
};

describe("notifications API", () => {
  it("lists notifications with unread counts and marks them read", async () => {
    const { token, user } = await makeUser("notify@example.com");
    const notification = await Notification.create({
      recipient: user.id,
      type: "listing.review_update",
      title: "Listing updated",
      message: "Your listing moved forward.",
    });

    const list = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(token));

    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.unread).toBe(1);

    const read = await request(app)
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set(bearer(token));

    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toEqual(expect.any(String));

    const unreadOnly = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set(bearer(token));

    expect(unreadOnly.body.data.total).toBe(0);
    expect(unreadOnly.body.data.unread).toBe(0);
  });

  it("does not expose another user's notifications", async () => {
    const first = await makeUser("notify-one@example.com");
    const second = await makeUser("notify-two@example.com");
    const hidden = await Notification.create({
      recipient: first.user.id,
      type: "kyc.approved",
      title: "KYC approved",
      message: "Approved.",
    });

    const read = await request(app)
      .post(`/api/v1/notifications/${hidden.id}/read`)
      .set(bearer(second.token));

    expect(read.status).toBe(404);
  });

  it("marks all notifications read", async () => {
    const { token, user } = await makeUser("notify-all@example.com");
    await Notification.create([
      {
        recipient: user.id,
        type: "inquiry.received",
        title: "Inquiry",
        message: "One",
      },
      {
        recipient: user.id,
        type: "inquiry.responded",
        title: "Inquiry",
        message: "Two",
      },
    ]);

    await request(app).post("/api/v1/notifications/read-all").set(bearer(token)).expect(200);
    const list = await request(app).get("/api/v1/notifications").set(bearer(token));
    expect(list.body.data.unread).toBe(0);
  });
});
