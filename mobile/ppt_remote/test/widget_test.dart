import 'package:flutter_test/flutter_test.dart';
import 'package:ppt_remote/main.dart';

void main() {
  testWidgets('PPTRemoteApp loads connect screen', (WidgetTester tester) async {
    await tester.pumpWidget(const PPTRemoteApp());

    expect(find.text('PPT Remote'), findsOneWidget);
    expect(find.text('SERVER HOST URL'), findsOneWidget);
    expect(find.text('6-CHARACTER SESSION CODE'), findsOneWidget);
  });
}
