# Design: Bảng điểm sinh viên & Dự báo điểm qua môn (Student Grade Tracker & Pass Predictor)

**Ngày:** 2026-09-05  
**Phạm vi:** Bóc tách bảng điểm sinh viên FAP (`Grade/StudentGrade.aspx` hoặc `Report/StudentGrade.aspx`), hiển thị tab Điểm số trên popup và dự báo điểm thi cuối kỳ (FE/PE) cần đạt để qua môn.

## Bối cảnh

Sinh viên FPTU thường xuyên phải theo dõi bảng điểm thành phần (Quiz, Lab, Assignment, Presentation, Progress Test) trên hệ thống FAP và tự tính tay xem cần đạt bao nhiêu điểm trong kỳ thi cuối kỳ (Final Exam / Practical Exam) để không bị học lại. Quy chế đào tạo của FPTU có hai điều kiện tiên quyết:
1. Điểm tổng kết môn học phải đạt từ $5.0 / 10$ trở lên.
2. Điểm thi cuối kỳ phải không dính điểm liệt (thường $\ge 4.0 / 10$).

Việc thiếu công cụ tính toán tự động khiến sinh viên phải dùng file Excel bên ngoài hoặc tính nhầm trọng số, dẫn đến tâm lý hoang mang hoặc chủ quan trước kỳ thi.

## Mục tiêu

1. Tự động bóc tách và lưu bảng điểm chi tiết các môn học từ trang xem điểm FAP vào tiện ích.
2. Cung cấp tab mới **"Điểm số"** trên popup:
   - Danh sách thẻ môn học trong học kỳ hiện tại.
   - Hiển thị điểm tích lũy hiện tại và phần trăm trọng số đã hoàn thành.
   - Huy hiệu dự báo trực quan: *Cần tối thiểu X.X điểm FE để qua môn*, *Đã chắc chắn qua môn*, hoặc *Nguy cơ trượt môn*.
   - Chi tiết từng cột điểm thành phần khi mở rộng thẻ.
   - Interactive Slider: Cho phép kéo chọn mục tiêu điểm tổng kết (từ 5.0 đến 9.0) để xem ngay số điểm FE cần đạt tương ứng.
3. Hỗ trợ quét tự động toàn bộ môn học trong kỳ thông qua dropdown môn trên FAP.

## Kiến trúc & Luồng dữ liệu

### 1. Phân chia Module

- **`manifest.json`**:
  - Bổ sung match URL `https://fap.fpt.edu.vn/Grade/*` vào `content_scripts`.
- **`lib/grades.js` (Mới - UMD module)**:
  - Parser DOM bảng điểm `parseFapGradeTable(tableElement)`:
    - Xử lý bảng `table[summary="Report"]`.
    - Xử lý `rowspan` ở cột `Grade category` (khi `tr` có 5 ô vs 4 ô do bị rowspan gộp).
    - Phân biệt các thành phần thông thường, hàng `Total` của từng category, hàng `Bonus`, và các hàng thi lại (`Resit`).
    - Bóc tách `<tfoot>`: `Average` (điểm tổng kết hiện tại) và `Status` (`Passed` / `Not passed`).
  - Hàm tính toán điểm tích lũy hiện tại (`calculateCurrentScore`).
  - Hàm tính điểm thi cuối kỳ cần đạt (`calculateRequiredExamScore`).
  - Phân loại trạng thái dự báo (`pass_guaranteed`, `achievable`, `impossible`, `completed`).
  - Xử lý điều kiện điểm liệt tối thiểu 4.0.
  - Thuần JS, không phụ thuộc Chrome API hay môi trường browser để chạy unit test 100% bằng `node --test`.
- **`content.js`**:
  - Thêm action `extractStudentGrade`: bóc tách bảng điểm `table[summary="Report"]` của môn hiện tại trên FAP.
  - Thêm action `getGradePageControls`: lấy danh sách các môn học trong kỳ từ dropdown `<select id="ctl00_mainContent_drpCourse">` (hoặc `ddlCourse`).
- **`background.js`**:
  - Hỗ trợ action `START_ALL_GRADES_SYNC`: tuần tự chuyển dropdown từng môn học trên tab FAP, chờ trang tải xong và bóc tách dữ liệu gộp vào `chrome.storage.local.studentGrades`.
- **`popup.html / .css / .js`**:
  - Bổ sung nút tab thứ 3 "Điểm số" (`#gradesTabBtn`) vào `.tab-navigation`.
  - Bổ sung vùng hiển thị `#gradesTab` trong `.popup-list`.
  - Hàng action buttons cho tab Điểm số: *Đồng bộ*, *Quét tất cả môn*, *Xoá điểm*.
  - Render danh sách thẻ môn học, progress bar, và interactive target score slider.

### 2. Mô hình dữ liệu & Cấu trúc bảng điểm FAP

Dựa trên cấu trúc thực tế của FAP:
```html
<table summary="Report">
  <thead>
    <tr><th>Grade category</th><th>Grade item</th><th>Weight</th><th>Value</th><th>Comment</th></tr>
  </thead>
  <tbody>
    <tr><td rowspan="2">Final exam PE</td><td>Final exam PE</td><td>100.0 %</td><td>7</td><td></td></tr>
    <tr><td>Total</td><td>100.0 %</td><td>7</td><td></td></tr>
    ...
    <tr><td></td><td>Bonus</td><td></td><td>1</td><td></td></tr>
  </tbody>
  <tfoot>
    <tr><td rowspan="2">Course total</td><td>Average</td><td colspan="3">8.0</td></tr>
    <tr><td>Status</td><td colspan="3"><font color="Green">Passed</font></td></tr>
  </tfoot>
</table>
```

Dữ liệu chuẩn hóa trong extension:
```json
{
  "courseCode": "PRJ301",
  "courseName": "Java Web Applications",
  "term": "Summer2026",
  "average": 8.0,
  "status": "Passed",
  "categories": [
    {
      "category": "Final exam PE",
      "weight": 100.0,
      "value": 7.0,
      "isFinal": true,
      "items": [
        { "name": "Final exam PE", "weight": 100.0, "value": 7.0 }
      ]
    }
  ],
  "bonus": 1.0,
  "lastUpdated": 1725530000000
}
```

### 3. Công thức tính toán & Trạng thái dự báo

1. **Điểm hiện tại**:
   $$CurrentScore = \sum_{i \in Completed} \left( Value_i \times \frac{Weight_i}{100} \right)$$
2. **Trọng số chưa có điểm**:
   $$RemainingWeight = \sum_{i \in Incomplete} Weight_i$$
3. **Nếu tất cả các cột điểm đã hoàn thành ($RemainingWeight = 0$)**:
   - Trạng thái: `completed` (Đã có điểm tổng kết cuối cùng).
4. **Nếu còn cột điểm chưa thi (đặc biệt là cột Final Exam / Practical Exam)**:
   - Điểm trung bình cần đạt cho các cột còn lại với mục tiêu $Target$ (mặc định 5.0):
     $$RawRequired = \frac{Target - CurrentScore}{\frac{RemainingWeight}{100}}$$
   - **Xét điều kiện điểm liệt 4.0**:
     - Điểm thực tế cần đạt: $Required = \max(RawRequired, 4.0)$.
     - Nếu $Required > 10.0$: Trạng thái `impossible` (Điểm thành phần không đủ để đạt mục tiêu, nguy cơ trượt môn).
     - Nếu $RawRequired \le 4.0$ và $CurrentScore + (4.0 \times \frac{RemainingWeight}{100}) \ge Target$: Trạng thái `pass_guaranteed` (Chỉ cần không dính điểm liệt $\ge 4.0$ là chắc chắn qua môn).
     - Ngược lại: Trạng thái `achievable` (Cần đạt từ $Required$ trở lên).

## Giao diện & Tương tác

1. **Tab Bar**: 3 tab cân đối `Lịch học` (icon book), `Kỳ thi` (icon clipboard), `Điểm số` (icon academic cap).
2. **Thẻ môn học (Grade Card)**:
   - Thanh tiến trình trọng số (Completed weight progress).
   - Điểm tạm tính hiện tại (ví dụ: `3.8 / 6.0 điểm đã có`).
   - Badge dự báo nổi bật:
     - Xanh lá: `Đã qua môn sớm (chỉ cần thi ≥ 4.0)`
     - Vàng/Xanh dương: `Cần thi tối thiểu: 5.5đ để qua môn`
     - Đỏ: `Nguy cơ trượt môn (cần > 9.5đ)`
3. **Interactive Target Slider**:
   - Khi click vào thẻ môn, hiển thị bảng chi tiết các cột điểm và thanh trượt mục tiêu điểm tổng kết (từ 5.0 đến 9.0).
   - Khi kéo thanh trượt, hệ thống tự động cập nhật ngay số điểm thi cần đạt tương ứng.

## Kế hoạch kiểm thử

1. **Unit tests (`tests/grades.test.js`)**:
   - Kiểm tra tính điểm hiện tại với nhiều trọng số khác nhau.
   - Kiểm tra dự báo điểm qua môn (mục tiêu 5.0).
   - Kiểm tra ràng buộc điểm liệt 4.0.
   - Kiểm tra phát hiện môn không thể qua (`impossible`).
   - Kiểm tra phát hiện qua môn sớm (`pass_guaranteed`).
   - Kiểm tra môn đã hoàn thành 100% cột điểm (`completed`).
   - Kiểm tra tính toán mục tiêu tùy chỉnh qua slider.
2. **Popup UI tests (`tests/popup-boot.test.js`)**:
   - Kiểm tra 3 tab chuyển đổi mượt mà, action row tương ứng hiển thị đúng tab.
   - Kiểm tra render danh sách thẻ điểm từ storage.
   - Kiểm tra mở rộng chi tiết thẻ và tương tác slider.
