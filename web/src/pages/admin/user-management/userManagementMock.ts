// File: web/src/pages/admin/user-management/userManagementMock.ts

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  role: "resident" | "rescue_staff" | "admin";
  status: "active" | "inactive";
  createdAt: string;
}

export const MOCK_USERS: User[] = [
  {
    id: "US-10291",
    fullName: "Nguyễn Thị Mai (TEST ONLY)",
    email: "mai.nguyen@gmail.com",
    phone: "0905.123.456",
    address: "Thôn Túy Loan, Hòa Phong, Hòa Vang",
    role: "resident",
    status: "active",
    createdAt: "2023-12-10T08:30:00Z",
  },
  {
    id: "US-10292",
    fullName: "Trần Đình Trọng (TEST ONLY)",
    email: "trong.td92@outlook.com",
    phone: "0913.884.221",
    address: "Kiệt 45 Mẹ Suốt, Hòa Khánh Nam, Liên Chiểu",
    role: "resident",
    status: "active",
    createdAt: "2023-11-05T14:15:00Z",
  },
  {
    id: "US-10293",
    fullName: "Lê Hoàng Long (TEST ONLY)",
    email: "long.lh_danang@gmail.com",
    phone: "0988.452.190",
    address: "Đường ĐT605, Hòa Tiến, Hòa Vang",
    role: "rescue_staff",
    status: "active",
    createdAt: "2024-01-18T09:20:00Z",
  },
  {
    id: "US-10294",
    fullName: "Phan Thị Thu Cúc (TEST ONLY)",
    email: "cuc.phan@yahoo.com",
    phone: "0903.771.620",
    address: "KDC ven sông Cầu Đỏ, Hòa Thọ Tây, Cẩm Lệ",
    role: "admin",
    status: "active",
    createdAt: "2024-02-24T16:45:00Z",
  },
  {
    id: "US-10297",
    fullName: "Bùi Anh Tuấn (TEST ONLY)",
    email: "tuan.bui_fake@mail.ru",
    phone: "0977.001.234",
    address: "Không xác định (Vị trí lạ)",
    role: "resident",
    status: "inactive",
    createdAt: "2024-09-28T23:40:00Z",
  }
];