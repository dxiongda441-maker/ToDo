// 科目の一覧。科目を増やすときはファイルを作ってここに追加する。

import fe from "./fe.js";
import python from "./python.js";
import wine from "./wine.js";
import english from "./english.js";

export const SUBJECTS = [fe, python, wine, english];

export function getSubject(id) {
    return SUBJECTS.find(subject => subject.id === id) || null;
}

export function topicName(topicId) {
    for (const subject of SUBJECTS) {
        const topic = subject.topics.find(t => t.id === topicId);
        if (topic) return topic.name;
    }
    return topicId;
}
