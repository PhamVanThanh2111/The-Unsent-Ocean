export interface SeedMessageItem {
  content: string;
  recipientRole: string;
  tagColor: string;
  candleCount: number;
  viewsCount: number;
  posX: number;
  posY: number;
  hoursAgo: number;
}

export const INITIAL_OCEAN_MESSAGES: SeedMessageItem[] = [
  {
    content:
      "Hôm qua đi ngang qua con dốc cũ, mùi hoa sữa đầu mùa làm mình khựng lại mất vài giây. Mình không còn buồn như ngày cậu rời đi nữa, chỉ là bỗng nhiên tự hỏi: ở thành phố bên kia, cậu đã tìm được người kiên nhẫn nghe cậu kể chuyện mỗi tối chưa? Mong cậu luôn bình an.",
    recipientRole: "Người yêu cũ",
    tagColor: "#4fd1c5",
    candleCount: 42,
    viewsCount: 118,
    posX: 0.14,
    posY: 0.42,
    hoursAgo: 2,
  },
  {
    content:
      "Gửi cậu của những năm tháng đầy hoài nghi và sợ hãi: Đừng khóc vì một kỳ thi không như ý, cũng đừng tự trách mình vì chưa biết tương lai sẽ đi về đâu. Mười năm sau nhìn lại, mọi vết xước hôm nay đều hóa thành ánh lân tinh dẫn đường cho cậu trưởng thành.",
    recipientRole: "Bản thân",
    tagColor: "#f6ad55",
    candleCount: 89,
    viewsCount: 204,
    posX: 0.28,
    posY: 0.58,
    hoursAgo: 4,
  },
  {
    content:
      "Nội ơi, con mới nhận tháng lương đầu tiên. Con đã mua chiếc áo len màu trầm mà năm ngoái Nội thích, nhưng tủ áo giờ trống vắng quá. Đêm nay gió biển lạnh lắm, ở nơi xa xôi không còn đau đớn đó, Nội nhớ giữ ấm nhé. Con nhớ Nội nhiều lắm.",
    recipientRole: "Người thân đã mất",
    tagColor: "#b794f4",
    candleCount: 156,
    viewsCount: 312,
    posX: 0.44,
    posY: 0.37,
    hoursAgo: 6,
  },
  {
    content:
      "Mình đã soạn rồi lại xóa hàng chục dòng tin nhắn chúc mừng sinh nhật cậu. Cuối cùng chỉ dám thả một chiếc icon nhỏ xíu vào story. Có lẽ làm một người bạn đứng từ xa nhìn cậu hạnh phúc là giới hạn dũng cảm lớn nhất của mình rồi.",
    recipientRole: "Crush thầm kín",
    tagColor: "#4fd1c5",
    candleCount: 64,
    viewsCount: 165,
    posX: 0.61,
    posY: 0.49,
    hoursAgo: 8,
  },
  {
    content:
      "Con xin lỗi vì những cuộc điện thoại vội vàng chỉ kéo dài vài phút, vì câu nói 'Con ổn mà, bố mẹ đừng lo' lúc con đang ngồi một mình giữa căn phòng trọ chật hẹp. Tết này nhất định con sẽ về sớm, ngồi nghe bố pha trà và phụ mẹ nấu bữa cơm chiều.",
    recipientRole: "Gia đình",
    tagColor: "#f6ad55",
    candleCount: 112,
    viewsCount: 249,
    posX: 0.77,
    posY: 0.39,
    hoursAgo: 9,
  },
  {
    content:
      "Gửi người lạ đang đọc được chiếc chai này giữa đêm khuya: Mình không biết hôm nay bạn đã phải gồng mình vượt qua những giông bão gì. Nhưng nếu bạn vẫn đang thức, hãy hít một hơi thật sâu nhé. Đại dương vẫn bao dung, và ngày mai mặt trời vẫn sẽ dịu dàng với bạn.",
    recipientRole: "Một người lạ",
    tagColor: "#4fd1c5",
    candleCount: 134,
    viewsCount: 280,
    posX: 0.22,
    posY: 0.71,
    hoursAgo: 11,
  },
  {
    content:
      "Cảm ơn anh vì ba năm thanh xuân rực rỡ nhất. Chúng ta chẳng ai có lỗi cả, chỉ là hai con thuyền cùng đi qua một vùng biển êm rồi phải rẽ về hai hướng đại dương khác nhau. Em trả lại anh những lời hứa cũ, giữ lại cho mình sự dịu dàng anh từng trao.",
    recipientRole: "Người yêu cũ",
    tagColor: "#b794f4",
    candleCount: 73,
    viewsCount: 187,
    posX: 0.52,
    posY: 0.68,
    hoursAgo: 13,
  },
  {
    content:
      "Giá như ngày ấy mình đừng nói những lời sắc nhọn trong lúc nóng giận. Một cái tôi quá lớn đã đẩy người thương mình nhất ra xa mãi mãi. Nếu thời gian có thể tua ngược về chiều mưa hôm đó, mình sẽ chỉ ôm chặt lấy cậu và nói lời xin lỗi.",
    recipientRole: "Người mình từng có lỗi",
    tagColor: "#f6ad55",
    candleCount: 51,
    viewsCount: 142,
    posX: 0.83,
    posY: 0.62,
    hoursAgo: 15,
  },
  {
    content:
      "Này cô bé hay tự ti vì chiếc kính dày và nụ cười ngập ngừng: Cậu đẹp hơn cậu nghĩ rất nhiều. Đừng cố gắng thu mình lại để vừa vặn với khuôn mẫu của bất kỳ ai. Hãy cứ đọc sách, cứ mơ mộng và cứ giữ trái tim nguyên bản ấy nhé.",
    recipientRole: "Bản thân",
    tagColor: "#4fd1c5",
    candleCount: 68,
    viewsCount: 150,
    posX: 0.11,
    posY: 0.55,
    hoursAgo: 16,
  },
  {
    content:
      "Ba à, hôm nay con tự sửa được chiếc xe đạp cũ và trồng thêm một chậu lan ngoài ban công giống hệt cách ba từng làm. Mỗi khi nhìn lên bầu trời đầy sao, con vẫn tin ba đang mỉm cười dõi theo mẹ con con từ một vì tinh tú rất gần.",
    recipientRole: "Người thân đã mất",
    tagColor: "#f6ad55",
    candleCount: 97,
    viewsCount: 210,
    posX: 0.38,
    posY: 0.46,
    hoursAgo: 18,
  },
  {
    content:
      "Mình nhớ những buổi chiều tan tầm ngồi sau lưng cậu đi vòng quanh hồ Tây, gió thổi bay cả những mỏi mệt. Cậu từng nói thích biển đêm vì biển biết giữ bí mật. Vậy đêm nay mình gửi bí mật lớn nhất của mình vào đại dương: Mình đã thương cậu suốt bốn mùa thu.",
    recipientRole: "Tình đầu",
    tagColor: "#b794f4",
    candleCount: 59,
    viewsCount: 138,
    posX: 0.68,
    posY: 0.74,
    hoursAgo: 20,
  },
  {
    content:
      "Gửi người từng cho mình mượn chiếc ô màu xanh ở trạm xe buýt chiều mưa tháng Tám: Mình chưa kịp hỏi tên bạn thì chuyến xe đã lăn bánh. Chiếc ô ấy vẫn nằm ở góc phòng mình như một lời nhắc rằng thế giới này luôn tồn tại những điều tử tế bất ngờ.",
    recipientRole: "Một người lạ",
    tagColor: "#4fd1c5",
    candleCount: 82,
    viewsCount: 193,
    posX: 0.89,
    posY: 0.48,
    hoursAgo: 21,
  },
  {
    content:
      "Chúng ta từng hứa sẽ cùng nhau đi ngắm cực quang trước năm 25 tuổi, vậy mà giờ đây tên của cậu chỉ còn nằm im trong danh bạ cũ. Dù không còn đi chung một con đường, mình vẫn mong tình bạn năm ấy là ký ức đẹp nhất của cả hai.",
    recipientRole: "Tri kỷ đã xa",
    tagColor: "#f6ad55",
    candleCount: 47,
    viewsCount: 112,
    posX: 0.06,
    posY: 0.64,
    hoursAgo: 5,
  },
  {
    content:
      "Gửi người thương của tương lai: Mình đang học cách yêu thương bản thân, học nấu những món ăn ngon và chữa lành những tổn thương cũ, để ngày gặp được cậu, mình sẽ dành cho cậu một trái tim bình yên và trọn vẹn nhất.",
    recipientRole: "Người thương tương lai",
    tagColor: "#4fd1c5",
    candleCount: 63,
    viewsCount: 145,
    posX: 0.94,
    posY: 0.56,
    hoursAgo: 3,
  },
];
