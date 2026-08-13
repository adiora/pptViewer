import 'package:flutter_test/flutter_test.dart';
import 'package:ppt_remote/main.dart';

void main() {
  testWidgets('PPTRemoteApp loads connect screen', (WidgetTester tester) async {
    await tester.pumpWidget(const PPTRemoteApp());

    expect(find.text('Remote Control'), findsOneWidget);
    expect(find.text('Enter Code'), findsOneWidget);
    expect(find.text('Connect'), findsOneWidget);
  });
}
